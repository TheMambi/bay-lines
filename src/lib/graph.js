import { MinHeap } from './minHeap';

// Charged each time a rider gets on a train. It only ranks routes: a change has to save more riding
// time than this to be worth making. It is never added to a time shown to the rider.
const BOARDING_COST = 8;

const NO_EXCLUSIONS = { lines: new Set(), transferStations: new Set() };

const lastDepartures = new WeakMap();

// The minute of the service day at which the last train of a stopping pattern leaves one of its stops.
export function lastTrainAt(pattern, stopIndex, day) {
  let byDay = lastDepartures.get(pattern);
  if (!byDay) {
    lastDepartures.set(pattern, (byDay = {}));
  }
  byDay[day] ??= Math.max(...pattern.departures[day]);
  return byDay[day] + pattern.dep[stopIndex];
}

// One node per station and one node per stop of each stopping pattern, so a train only goes where it
// stops. The trip planner and Reach both search this graph, which is why they pick the same routes.
export function buildServiceGraph(net, service, exclude = NO_EXCLUSIONS, fromId) {
  const patterns = net.activePatterns(service).filter((pattern) => !exclude.lines.has(pattern.lineId));
  const stationIndex = new Map(net.stations.map((station, index) => [station.id, index]));
  const length = net.stations.length;
  const patternOffset = [];
  let nodeCount = length;
  for (const pattern of patterns) {
    patternOffset.push(nodeCount);
    nodeCount += pattern.stations.length;
  }
  const arcs = Array.from({ length: nodeCount }, () => []);
  patterns.forEach((pattern, patternIndex) => {
    const tieBreak =
      0.01 / (1 + (pattern.service[service.day]?.[service.period]?.trips ?? 1)) + patternIndex * 1e-7;
    const lastStop = pattern.stations.length - 1;
    pattern.stations.forEach((stationId, stopIndex) => {
      const node = patternOffset[patternIndex] + stopIndex;
      const stationNode = stationIndex.get(stationId);
      if (stopIndex < lastStop && (stationId === fromId || !exclude.transferStations.has(stationId))) {
        arcs[stationNode].push({
          to: node,
          cost: BOARDING_COST + tieBreak,
          minutes: 0,
          lastTrain: lastTrainAt(pattern, stopIndex, service.day),
        });
      }
      if (stopIndex < lastStop) {
        const ride = pattern.dep[stopIndex + 1] - pattern.dep[stopIndex];
        arcs[node].push({ to: node + 1, cost: Math.max(0.5, ride), minutes: ride });
      }
      if (stopIndex > 0) {
        // A pattern node stands for leaving the stop, so getting off there is earlier by the pause.
        arcs[node].push({
          to: stationNode,
          cost: 0,
          minutes: pattern.arr[stopIndex] - pattern.dep[stopIndex],
        });
      }
    });
  });
  return { patterns, patternOffset, stationIndex, length, arcs };
}

// Dijkstra from one station. With a target it stops as soon as the target is settled.
// `nowMinute` is given for the "Right now" service only. A train then cannot be boarded at a stop its
// last run leaves before the rider could be there: now plus the riding so far, with no waiting counted.
export function shortestPaths(graph, sourceId, targetId, nowMinute) {
  const source = graph.stationIndex.get(sourceId);
  const target = graph.stationIndex.get(targetId);
  const dist = Array(graph.arcs.length).fill(Infinity);
  const prev = Array(graph.arcs.length).fill(-1);
  const minutes = Array(graph.arcs.length).fill(0);
  const queue = new MinHeap();
  dist[source] = 0;
  queue.push(0, source);
  while (queue.size) {
    const [cost, node] = queue.pop();
    if (!(cost > dist[node])) {
      if (node === target) {
        break;
      }
      for (const arc of graph.arcs[node]) {
        // Only boarding arcs carry `lastTrain`.
        const missed = nowMinute != null && nowMinute + minutes[node] > arc.lastTrain;
        const candidate = cost + arc.cost;
        if (!missed && candidate < dist[arc.to] - 1e-12) {
          dist[arc.to] = candidate;
          prev[arc.to] = node;
          minutes[arc.to] = minutes[node] + arc.minutes;
          queue.push(candidate, arc.to);
        }
      }
    }
  }
  return { dist, prev };
}

// The rides along the best path to a station: the pattern of each, and the stops boarded and left.
export function legsFromPath(graph, prev, stationId) {
  const { patterns, patternOffset, length } = graph;
  const path = [];
  for (let node = graph.stationIndex.get(stationId); node !== -1; node = prev[node]) {
    path.push(node);
  }
  path.reverse();
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
  return legs;
}

const lastAnswers = new Map();

// A "Right now" answer is worked out again every minute. While it reads the same as the one before,
// the caller gets the earlier object back, so React neither redraws the map nor announces the route
// again. One answer is kept for each slot.
export function sameWhileUnchanged(slot, answer) {
  const signature = JSON.stringify(answer instanceof Map ? [...answer] : answer);
  const last = lastAnswers.get(slot);
  if (last?.signature === signature) {
    return last.answer;
  }
  lastAnswers.set(slot, { signature, answer });
  return answer;
}
