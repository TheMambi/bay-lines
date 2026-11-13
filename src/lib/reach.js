import { buildServiceGraph, legsFromPath, shortestPaths } from './graph';
import { buildItinerary } from './routing';

// Each station gets the route the trip planner would suggest. The transfer and first-wait minutes are
// the rider's own assumptions, so they are added to that route's time and never used to choose it:
// as search costs they make a change free at "none", and a one-seat ride is listed as a dozen changes.
export function computeReach(net, service, originId, transferMinutes = 5, firstWaitMinutes = 0) {
  const result = new Map();
  if (!net.stationById.has(originId)) {
    return result;
  }
  const graph = buildServiceGraph(net, service);
  const { dist, prev } = shortestPaths(graph, originId);
  net.stations.forEach((station, index) => {
    if (!isFinite(dist[index])) {
      return;
    }
    if (station.id === originId) {
      result.set(station.id, { minutes: 0, rideMinutes: 0, transfers: 0, lineIds: [] });
      return;
    }
    const itinerary = buildItinerary(net, service, { legs: legsFromPath(graph, prev, station.id) });
    result.set(station.id, {
      minutes: Math.round(
        itinerary.rideMinutes +
          Math.max(0, firstWaitMinutes) +
          itinerary.transfers * Math.max(0, transferMinutes),
      ),
      rideMinutes: itinerary.rideMinutes,
      transfers: itinerary.transfers,
      lineIds: itinerary.legs.map((leg) => leg.lineId),
    });
  });
  return result;
}

export function reachBand(minutes, horizon) {
  if (!(minutes <= horizon)) {
    return null;
  }
  const share = horizon <= 0 ? 0 : minutes / horizon;
  return Math.min(4, Math.floor(share * 5));
}

export function summarizeReach(reach, origin, horizon, stationCount) {
  let within = 0;
  let farthest = null;
  for (const [stationId, entry] of reach) {
    if (!(stationId === origin || entry.minutes > horizon)) {
      within++;
      if (!farthest || entry.minutes > farthest.minutes) {
        farthest = { id: stationId, minutes: entry.minutes };
      }
    }
  }
  return { within, others: stationCount - 1, farthest };
}

export function meetingPoints(reachA, reachB) {
  const points = [];
  for (const [stationId, fromA] of reachA) {
    const fromB = reachB.get(stationId);
    if (fromB) {
      points.push({ id: stationId, minutes: Math.max(fromA.minutes, fromB.minutes), a: fromA, b: fromB });
    }
  }
  return points.sort(
    (left, right) =>
      left.minutes - right.minutes ||
      left.a.minutes + left.b.minutes - (right.a.minutes + right.b.minutes) ||
      Math.abs(left.a.minutes - left.b.minutes) - Math.abs(right.a.minutes - right.b.minutes) ||
      left.id.localeCompare(right.id),
  );
}
