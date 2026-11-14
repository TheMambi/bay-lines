import { buildServiceGraph, lastTrainAt, legsFromPath, sameWhileUnchanged, shortestPaths } from './graph';
import { serviceKey } from './network';

const ALTERNATIVE_SLACK_MINUTES = 25;

function shortestPath(net, service, fromId, toId, exclude, nowMinute) {
  const graph = buildServiceGraph(net, service, exclude, fromId);
  const { dist, prev } = shortestPaths(graph, fromId, toId, nowMinute);
  const cost = dist[graph.stationIndex.get(toId)];
  if (!isFinite(cost)) {
    return null;
  }
  return { cost, legs: legsFromPath(graph, prev, toId) };
}

// The stop where a pattern is boarded to ride exactly these stops, or -1 if it does not run them.
const boardingStop = (pattern, stops) => {
  const start = pattern.stations.indexOf(stops[0]);
  return start >= 0 && stops.every((stop, k) => pattern.stations[start + k] === stop) ? start : -1;
};

// `nowMinute` is given for the "Right now" service only: a leg is then never named after a train whose
// last run leaves the boarding stop before the rider could be there.
export function buildItinerary(net, service, path, nowMinute) {
  const patterns = net.activePatterns(service);
  const legs = path.legs.map((leg) => ({ ...leg }));
  const changeOptions = legs.map(() => []);
  const canBoard = (pattern, stop, ridden) =>
    nowMinute == null || nowMinute + ridden <= lastTrainAt(pattern, stop, service.day);
  // Riding minutes before each leg is boarded, on the trains the search picked.
  const ridden = legs.map(() => 0);
  for (let legIndex = 0; legIndex < legs.length - 1; legIndex++) {
    const leg = legs[legIndex];
    const nextLeg = legs[legIndex + 1];
    const end = leg.i1;
    const start = nextLeg.i0;
    let ahead = 0;
    while (
      end + ahead + 1 < leg.pattern.stations.length &&
      start + ahead + 1 < nextLeg.i1 &&
      leg.pattern.stations[end + ahead + 1] === nextLeg.pattern.stations[start + ahead + 1] &&
      canBoard(
        nextLeg.pattern,
        start + ahead + 1,
        ridden[legIndex] + leg.pattern.arr[end + ahead + 1] - leg.pattern.dep[leg.i0],
      )
    ) {
      ahead++;
    }
    let behind = 0;
    while (
      end - behind - 1 > leg.i0 &&
      start - behind - 1 >= 0 &&
      leg.pattern.stations[end - behind - 1] === nextLeg.pattern.stations[start - behind - 1]
    ) {
      behind++;
    }
    changeOptions[legIndex + 1] = leg.pattern.stations.slice(end - behind, end + ahead);
    leg.i1 = end + ahead;
    nextLeg.i0 = start + ahead;
    ridden[legIndex + 1] = ridden[legIndex] + leg.pattern.arr[leg.i1] - leg.pattern.dep[leg.i0];
  }
  const builtLegs = legs.map(({ pattern, i0, i1 }, legIndex) => {
    const stops = pattern.stations.slice(i0, i1 + 1);
    const candidates = patterns
      .filter((candidate) => {
        const start = boardingStop(candidate, stops);
        return start >= 0 && canBoard(candidate, start, ridden[legIndex]);
      })
      .sort(
        (a, b) =>
          (b.service[service.day]?.[service.period]?.trips ?? 0) -
            (a.service[service.day]?.[service.period]?.trips ?? 0) || a.lineId.localeCompare(b.lineId),
      );
    const best = candidates[0] ?? pattern;
    // Timed on the train the leg names: another line can cover the same stops in fewer minutes.
    const boarded = best.stations.indexOf(stops[0]);
    const minutes = Math.max(1, Math.round(best.arr[boarded + stops.length - 1] - best.dep[boarded]));
    const alsoWorks = [];
    for (const candidate of candidates) {
      if (!(
        candidate.lineId === best.lineId || alsoWorks.some((option) => option.lineId === candidate.lineId)
      )) {
        alsoWorks.push({
          lineId: candidate.lineId,
          patternId: candidate.id,
          toward: candidate.stations[candidate.stations.length - 1],
        });
      }
    }
    const notes = [];
    for (let k = 0; k < stops.length - 1; k++) {
      const pair = [stops[k], stops[k + 1]];
      if (pair.includes('PITT') && pair.includes('PCTR')) {
        notes.push('ebart-transfer');
      }
    }
    if (best.lineId === 'grey' && (stops[0] === 'COLS' || stops[stops.length - 1] === 'COLS')) {
      notes.push('oac-transfer');
    }
    return {
      patternId: best.id,
      lineId: best.lineId,
      toward: best.stations[best.stations.length - 1],
      from: stops[0],
      to: stops[stops.length - 1],
      stops,
      minutes,
      alsoWorks,
      changeOptions: changeOptions[legIndex],
      window: best.service[service.day]?.[service.period],
      notes,
    };
  });
  return {
    legs: builtLegs,
    transfers: Math.max(0, builtLegs.length - 1),
    rideMinutes: builtLegs.reduce((acc, item) => acc + item.minutes, 0),
    stopCount: builtLegs.reduce((acc, item) => acc + item.stops.length - 1, 0),
  };
}

const itinerarySignature = (itinerary) => itinerary.legs.map((leg) => `${leg.from}>${leg.to}`).join('|');

// With a change barred at one station, the search can ride past that station and come back through it.
const doublesBack = (itinerary) => {
  const visited = itinerary.legs.flatMap((leg, index) => (index === 0 ? leg.stops : leg.stops.slice(1)));
  return new Set(visited).size !== visited.length;
};

const routeCache = new WeakMap();

function plan(net, service, fromId, toId, nowMinute) {
  const best = shortestPath(
    net,
    service,
    fromId,
    toId,
    { lines: new Set(), transferStations: new Set() },
    nowMinute,
  );
  let result;
  if (!best) {
    result = { status: 'no-route' };
  } else {
    const primary = buildItinerary(net, service, best, nowMinute);
    const seen = new Set([itinerarySignature(primary)]);
    const alternatives = [];
    const variants = [];
    for (const leg of primary.legs) {
      variants.push({ lines: new Set([leg.lineId]), transferStations: new Set() });
    }
    for (const leg of primary.legs.slice(1)) {
      variants.push({ lines: new Set(), transferStations: new Set([leg.from]) });
    }
    for (const exclude of variants) {
      const path = shortestPath(net, service, fromId, toId, exclude, nowMinute);
      if (!path || path.cost > best.cost + ALTERNATIVE_SLACK_MINUTES) {
        continue;
      }
      const itinerary = buildItinerary(net, service, path, nowMinute);
      const signature = itinerarySignature(itinerary);
      if (!seen.has(signature) && !doublesBack(itinerary)) {
        seen.add(signature);
        alternatives.push({ it: itinerary, cost: path.cost });
      }
    }
    alternatives.sort((a, b) => a.cost - b.cost || a.it.transfers - b.it.transfers);
    result = { status: 'ok', itineraries: [primary, ...alternatives.slice(0, 2).map((alt) => alt.it)] };
  }
  return result;
}

// The first train of the usual suggestion that a rider starting now can no longer board. Every active
// pattern that shows the same line and destination and runs the same stops counts as that train.
function missedTrain(net, service, itinerary, nowMinute) {
  let elapsed = 0;
  for (const leg of itinerary.legs) {
    const minute = Math.max(
      ...net
        .activePatterns(service)
        .filter((pattern) => pattern.lineId === leg.lineId && pattern.stations.at(-1) === leg.toward)
        .map((pattern) => [pattern, boardingStop(pattern, leg.stops)])
        .filter(([, start]) => start >= 0)
        .map(([pattern, start]) => lastTrainAt(pattern, start, service.day)),
    );
    if (nowMinute + elapsed > minute) {
      return {
        lineId: leg.lineId,
        toward: leg.toward,
        stationId: leg.from,
        minute,
        gone: nowMinute > minute,
      };
    }
    elapsed += leg.minutes;
  }
  return undefined;
}

// For the "Right now" service: the routes a rider starting at `nowMinute` can still ride, with the
// train of the usual suggestion that can no longer be caught, if there is one.
function planNow(net, service, fromId, toId, nowMinute) {
  const usual = planTrips(net, service, fromId, toId);
  if (usual.status !== 'ok') {
    return usual;
  }
  const lastTrain = missedTrain(net, service, usual.itineraries[0], nowMinute);
  const result = plan(net, service, fromId, toId, nowMinute);
  if (result.status !== 'ok') {
    return { ...result, ended: true, lastTrain };
  }
  return lastTrain ? { ...result, lastTrain } : result;
}

export function planTrips(net, service, fromId, toId, nowMinute) {
  if (nowMinute != null) {
    return sameWhileUnchanged(`trip|${fromId}|${toId}`, planNow(net, service, fromId, toId, nowMinute));
  }
  const ids = [fromId, toId].filter((id) => !net.stationById.has(id));
  if (ids.length) {
    return { status: 'unknown-station', ids };
  }
  if (fromId === toId) {
    return { status: 'same-station' };
  }
  let cache = routeCache.get(net);
  if (!cache) {
    routeCache.set(net, (cache = new Map()));
  }
  const key = `${serviceKey(service)}|${fromId}|${toId}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const result = plan(net, service, fromId, toId);
  cache.set(key, result);
  return result;
}
