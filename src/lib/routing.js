import { buildServiceGraph, legsFromPath, shortestPaths } from './graph';
import { serviceKey } from './network';

const ALTERNATIVE_SLACK_MINUTES = 25;

function shortestPath(net, service, fromId, toId, exclude) {
  const graph = buildServiceGraph(net, service, exclude, fromId);
  const { dist, prev } = shortestPaths(graph, fromId, toId);
  const cost = dist[graph.stationIndex.get(toId)];
  if (!isFinite(cost)) {
    return null;
  }
  return { cost, legs: legsFromPath(graph, prev, toId) };
}

export function buildItinerary(net, service, path) {
  const patterns = net.activePatterns(service);
  const legs = path.legs.map((leg) => ({ ...leg }));
  const changeOptions = legs.map(() => []);
  for (let legIndex = 0; legIndex < legs.length - 1; legIndex++) {
    const leg = legs[legIndex];
    const nextLeg = legs[legIndex + 1];
    const end = leg.i1;
    const start = nextLeg.i0;
    let ahead = 0;
    while (
      end + ahead + 1 < leg.pattern.stations.length &&
      start + ahead + 1 < nextLeg.i1 &&
      leg.pattern.stations[end + ahead + 1] === nextLeg.pattern.stations[start + ahead + 1]
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
  }
  const builtLegs = legs.map(({ pattern, i0, i1 }, legIndex) => {
    const stops = pattern.stations.slice(i0, i1 + 1);
    const candidates = patterns
      .filter((candidate) => {
        const start = candidate.stations.indexOf(stops[0]);
        return start >= 0 && stops.every((stop, k) => candidate.stations[start + k] === stop);
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

export function planTrips(net, service, fromId, toId) {
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
  const best = shortestPath(net, service, fromId, toId, { lines: new Set(), transferStations: new Set() });
  let result;
  if (!best) {
    result = { status: 'no-route' };
  } else {
    const primary = buildItinerary(net, service, best);
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
      const path = shortestPath(net, service, fromId, toId, exclude);
      if (!path || path.cost > best.cost + ALTERNATIVE_SLACK_MINUTES) {
        continue;
      }
      const itinerary = buildItinerary(net, service, path);
      const signature = itinerarySignature(itinerary);
      if (!seen.has(signature) && !doublesBack(itinerary)) {
        seen.add(signature);
        alternatives.push({ it: itinerary, cost: path.cost });
      }
    }
    alternatives.sort((a, b) => a.cost - b.cost || a.it.transfers - b.it.transfers);
    result = { status: 'ok', itineraries: [primary, ...alternatives.slice(0, 2).map((alt) => alt.it)] };
  }
  cache.set(key, result);
  return result;
}
