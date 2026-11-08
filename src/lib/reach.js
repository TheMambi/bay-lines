import { MinHeap } from './minHeap';

export function computeReach(net, service, originId, transferMinutes = 5, firstWaitMinutes = 0) {
  const result = new Map();
  if (!net.stationById.has(originId)) {
    return result;
  }
  const patterns = net.activePatterns(service);
  const stationIndex = new Map(net.stations.map((station, index) => [station.id, index]));
  const length = net.stations.length;
  const patternOffset = [];
  let nodeCount = length;
  for (const pattern of patterns) {
    patternOffset.push(nodeCount);
    nodeCount += pattern.stations.length;
  }
  const graph = Array.from({ length: nodeCount }, () => []);
  patterns.forEach((pattern, patternIndex) => {
    const tieBreak =
      0.01 / (1 + (pattern.service[service.day]?.[service.period]?.trips ?? 1)) + patternIndex * 1e-7;
    const lastStop = pattern.stations.length - 1;
    pattern.stations.forEach((stationId, stopIndex) => {
      const node = patternOffset[patternIndex] + stopIndex;
      const stationNode = stationIndex.get(stationId);
      if (stopIndex < lastStop) {
        graph[stationNode].push({
          to: node,
          cost:
            (stationId === originId ? Math.max(0, firstWaitMinutes) : Math.max(0, transferMinutes)) +
            tieBreak,
        });
      }
      if (stopIndex < lastStop) {
        graph[node].push({
          to: node + 1,
          cost: Math.max(0.5, pattern.dep[stopIndex + 1] - pattern.dep[stopIndex]),
        });
      }
      if (stopIndex > 0) {
        graph[node].push({ to: stationNode, cost: 0 });
      }
    });
  });
  const source = stationIndex.get(originId);
  const dist = Array(nodeCount).fill(Infinity);
  const prev = Array(nodeCount).fill(-1);
  const queue = new MinHeap();
  dist[source] = 0;
  queue.push(0, source);
  while (queue.size) {
    const [cost, node] = queue.pop();
    if (!(cost > dist[node])) {
      for (const arc of graph[node]) {
        const candidate = cost + arc.cost;
        if (candidate < dist[arc.to] - 1e-12) {
          dist[arc.to] = candidate;
          prev[arc.to] = node;
          queue.push(candidate, arc.to);
        }
      }
    }
  }
  const patternAt = (node) => {
    let lo = 0;
    let hi = patterns.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (patternOffset[mid] <= node) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };
  net.stations.forEach((station, index) => {
    if (!isFinite(dist[index])) {
      return;
    }
    if (index === source) {
      result.set(station.id, { minutes: 0, rideMinutes: 0, transfers: 0, lineIds: [] });
      return;
    }
    const path = [];
    for (let node = index; node !== -1; node = prev[node]) {
      path.push(node);
    }
    path.reverse();
    const legs = [];
    let leg = null;
    for (let step = 1; step < path.length; step++) {
      const prevNode = path[step - 1];
      const node = path[step];
      if (prevNode < length && node >= length) {
        const patternIndex = patternAt(node);
        leg = {
          pattern: patterns[patternIndex],
          i0: node - patternOffset[patternIndex],
          i1: node - patternOffset[patternIndex],
        };
      } else {
        if (prevNode >= length && node >= length) {
          if (leg) {
            leg.i1 = node - patternOffset[patternAt(node)];
          }
        } else if (prevNode >= length && node < length) {
          if (leg) {
            legs.push(leg);
          }
          leg = null;
        }
      }
    }
    const rideMinutes = legs.reduce(
      (acc, item) => acc + Math.max(1, Math.round(item.pattern.arr[item.i1] - item.pattern.dep[item.i0])),
      0,
    );
    const transfers = Math.max(0, legs.length - 1);
    result.set(station.id, {
      minutes: Math.round(
        rideMinutes + Math.max(0, firstWaitMinutes) + transfers * Math.max(0, transferMinutes),
      ),
      rideMinutes,
      transfers,
      lineIds: legs.map((part) => part.pattern.lineId),
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
