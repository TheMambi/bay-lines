import networkData from '../data/network.json';

const MIN_PATTERN_SHARE = 0.25;

export const DAYS = ['weekday', 'saturday', 'sunday'];

export const PERIODS = ['day', 'evening'];

export const edgeKey = (a, b) => {
  if (a < b) {
    return `${a}|${b}`;
  }
  return `${b}|${a}`;
};

export const serviceKey = (service) => `${service.day}:${service.period}`;

function selectRegularPatterns(patterns, service) {
  const busiestTrips = new Map();
  for (const pattern of patterns) {
    const slot = pattern.service[service.day]?.[service.period];
    if (!slot) {
      continue;
    }
    const key = `${pattern.lineId}|${pattern.direction}`;
    busiestTrips.set(key, Math.max(busiestTrips.get(key) ?? 0, slot.trips));
  }
  return patterns.filter((pattern) => {
    const slot = pattern.service[service.day]?.[service.period];
    if (!slot) {
      return false;
    }
    const busiest = busiestTrips.get(`${pattern.lineId}|${pattern.direction}`) ?? 0;
    return slot.trips >= Math.max(2, MIN_PATTERN_SHARE * busiest);
  });
}

function buildNetwork(networkData) {
  const stations = [...networkData.stations];
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const lineById = new Map(networkData.lines.map((line) => [line.id, line]));
  const patternById = new Map(networkData.patterns.map((pattern) => [pattern.id, pattern]));
  const activeCache = new Map();
  const activePatterns = (service) => {
    const key = serviceKey(service);
    let patterns = activeCache.get(key);
    if (!patterns) {
      patterns = selectRegularPatterns(networkData.patterns, service);
      activeCache.set(key, patterns);
    }
    return patterns;
  };
  const regularIds = new Set();
  for (const day of DAYS) {
    for (const period of PERIODS) {
      for (const pattern of activePatterns({ day, period })) {
        regularIds.add(pattern.id);
      }
    }
  }
  const regularPatterns = networkData.patterns.filter((pattern) => regularIds.has(pattern.id));
  const edgeByKey = new Map();
  for (const pattern of regularPatterns) {
    for (let i = 0; i < pattern.stations.length - 1; i++) {
      const stopA = pattern.stations[i];
      const stopB = pattern.stations[i + 1];
      const key = edgeKey(stopA, stopB);
      let edge = edgeByKey.get(key);
      if (!edge) {
        edge = { key, a: stopA < stopB ? stopA : stopB, b: stopA < stopB ? stopB : stopA, lineIds: [] };
        edgeByKey.set(key, edge);
      }
      if (!edge.lineIds.includes(pattern.lineId)) {
        edge.lineIds.push(pattern.lineId);
      }
    }
  }
  const edges = [...edgeByKey.values()];
  const linesByStation = new Map();
  const endLinesByStation = new Map();
  const throughLinesByStation = new Map();
  for (const pattern of regularPatterns) {
    pattern.stations.forEach((stationId, index) => {
      if (!linesByStation.has(stationId)) {
        linesByStation.set(stationId, new Set());
      }
      linesByStation.get(stationId).add(pattern.lineId);
      if (index === 0 || index === pattern.stations.length - 1) {
        if (!endLinesByStation.has(stationId)) {
          endLinesByStation.set(stationId, new Set());
        }
        endLinesByStation.get(stationId).add(pattern.lineId);
      } else {
        if (!throughLinesByStation.has(stationId)) {
          throughLinesByStation.set(stationId, new Set());
        }
        throughLinesByStation.get(stationId).add(pattern.lineId);
      }
    });
  }
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.a)) {
      adjacency.set(edge.a, new Set());
    }
    if (!adjacency.has(edge.b)) {
      adjacency.set(edge.b, new Set());
    }
    adjacency.get(edge.a).add(edge.b);
    adjacency.get(edge.b).add(edge.a);
  }
  const degree = (stationId) => adjacency.get(stationId)?.size ?? 0;
  const isInterchange = (stationId) => {
    if (!linesByStation.get(stationId)) {
      return false;
    }
    if (degree(stationId) >= 3) {
      return true;
    }
    const ends = endLinesByStation.get(stationId);
    const through = throughLinesByStation.get(stationId);
    return !!(ends && through);
  };
  const isTerminal = (stationId) => degree(stationId) === 1;
  const stationOrder = networkData.fares.stationOrder;
  const fareIndex = new Map(stationOrder.map((stationId, index) => [stationId, index]));
  return {
    data: networkData,
    stations,
    lines: networkData.lines,
    stationById,
    lineById,
    patterns: networkData.patterns,
    patternById,
    edges,
    edgeByKey,
    activePatterns,
    linesAt: (stationId) => [...(linesByStation.get(stationId) ?? [])],
    terminalLines: (stationId) => [...(endLinesByStation.get(stationId) ?? [])],
    isInterchange,
    isTerminal,
    degree,
    neighbors: (stationId) => [...(adjacency.get(stationId) ?? [])],
    fareCents: (fromId, toId, categoryId = 'adult') => {
      const category = networkData.fares.categories.find((c) => c.id === categoryId);
      const fromIndex = fareIndex.get(fromId);
      const toIndex = fareIndex.get(toId);
      if (!category || fromIndex == null || toIndex == null || fromIndex === toIndex) {
        return null;
      }
      return category.cents[fromIndex][toIndex];
    },
  };
}

export const net = buildNetwork(networkData);
