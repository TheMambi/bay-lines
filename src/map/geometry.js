import { edgeKey } from '../lib/network';
import { BENDS, CORRIDORS, LANE_GAP, LINE_ORDER, STATION_LAYOUT } from './schematic';

const normalize = (v) => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};

const perpendicular = (v) => ({ x: -v.y, y: v.x });

function offsetPolyline(pts, offset) {
  if (offset === 0) {
    return pts;
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const dirIn = prev ? perpendicular(normalize({ x: cur.x - prev.x, y: cur.y - prev.y })) : null;
    const dirOut = next ? perpendicular(normalize({ x: next.x - cur.x, y: next.y - cur.y })) : null;
    if (dirIn && dirOut) {
      const bisector = normalize({ x: dirIn.x + dirOut.x, y: dirIn.y + dirOut.y });
      const miter = Math.min(2, 1 / Math.max(0.5, bisector.x * dirIn.x + bisector.y * dirIn.y));
      out.push({ x: cur.x + bisector.x * offset * miter, y: cur.y + bisector.y * offset * miter });
    } else {
      const dir = dirIn ?? dirOut;
      out.push({ x: cur.x + dir.x * offset, y: cur.y + dir.y * offset });
    }
  }
  return out;
}

const toPathData = (points) =>
  points.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join('');

export function buildGeometry(net) {
  const pos = (stationId) => {
    const layout = STATION_LAYOUT[stationId];
    if (!layout) {
      throw Error(`No layout for station ${stationId}`);
    }
    return { x: layout.x * 11, y: layout.y * 11 };
  };
  const corridorEdges = new Map();
  for (const corridor of CORRIDORS) {
    for (let i = 0; i < corridor.length - 1; i++) {
      const key = edgeKey(corridor[i], corridor[i + 1]);
      if (net.edgeByKey.has(key) && !corridorEdges.has(key)) {
        corridorEdges.set(key, { from: corridor[i], to: corridor[i + 1] });
      }
    }
  }
  const edges = [];
  for (const netEdge of net.edges) {
    const oriented = corridorEdges.get(netEdge.key);
    if (!oriented) {
      throw Error(`Track segment ${netEdge.key} is not in any corridor`);
    }
    const bends = (BENDS[`${oriented.from}|${oriented.to}`] ?? []).map(([x, y]) => ({
      x: x * 11,
      y: y * 11,
    }));
    const lines = [...netEdge.lineIds].sort((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b));
    edges.push({
      key: netEdge.key,
      from: oriented.from,
      to: oriented.to,
      pts: [pos(oriented.from), ...bends, pos(oriented.to)],
      lines,
    });
  }
  const edgeByKey = new Map(edges.map((edge) => [edge.key, edge]));
  const laneOffset = (edge, lineId) => (edge.lines.indexOf(lineId) - (edge.lines.length - 1) / 2) * LANE_GAP;
  const lanePath = (edge, lineId) => toPathData(offsetPolyline(edge.pts, laneOffset(edge, lineId)));
  const edgesAt = new Map();
  for (const edge of edges) {
    for (const stationId of [edge.from, edge.to]) {
      if (!edgesAt.has(stationId)) {
        edgesAt.set(stationId, []);
      }
      edgesAt.get(stationId).push(edge);
    }
  }
  const symbols = new Map();
  for (const station of net.stations) {
    const at = pos(station.id);
    const incident = edgesAt.get(station.id) ?? [];
    const arms = incident.map((edge) => {
      const neighbor = edge.from === station.id ? edge.pts[1] : edge.pts[edge.pts.length - 2];
      return normalize({ x: neighbor.x - at.x, y: neighbor.y - at.y });
    });
    const lanes = Math.max(1, ...incident.map((edge) => edge.lines.length));
    const interchange = net.isInterchange(station.id);
    const terminal = incident.length === 1;
    const main = incident.slice().sort((a, b) => b.lines.length - a.lines.length)[0];
    const mainArm = arms[incident.indexOf(main)] ?? { x: 1, y: 0 };
    const straight = incident.length === 2 && arms[0].x * arms[1].x + arms[0].y * arms[1].y < -0.99;
    const halfSpan = ((lanes - 1) * LANE_GAP) / 2;
    let angle = (Math.atan2(mainArm.y, mainArm.x) * 180) / Math.PI + 90;
    if (incident.length === 2 && !straight) {
      const axis = normalize({ x: arms[0].x - arms[1].x, y: arms[0].y - arms[1].y });
      angle = (Math.atan2(axis.x, -axis.y) * 180) / Math.PI;
    }
    let kind;
    let half;
    let thick;
    if (terminal) {
      kind = 'bar';
      half = halfSpan + 6.2;
      thick = 3.6;
    } else if (incident.length >= 3 || (interchange && !straight)) {
      kind = 'disc';
      half = Math.max(6.4, halfSpan + 6.4);
      thick = half;
    } else if (lanes > 1 || interchange) {
      kind = 'pill';
      half = halfSpan + 5.6;
      thick = interchange ? 6.2 : 5.2;
    } else {
      kind = 'dot';
      half = 4.7;
      thick = 4.7;
    }
    symbols.set(station.id, {
      id: station.id,
      x: at.x,
      y: at.y,
      kind,
      angle,
      half,
      thick,
      interchange,
      terminal,
      lanes,
      arms,
    });
  }
  const xs = net.stations.map((station) => pos(station.id).x);
  const ys = net.stations.map((station) => pos(station.id).y);
  return {
    edges,
    edgeByKey,
    symbols,
    pos,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    lanePath,
    laneOffset,
    pointAlong: (edge, frac) => {
      const segLengths = [];
      let total = 0;
      for (let seg = 0; seg < edge.pts.length - 1; seg++) {
        const len = Math.hypot(edge.pts[seg + 1].x - edge.pts[seg].x, edge.pts[seg + 1].y - edge.pts[seg].y);
        segLengths.push(len);
        total += len;
      }
      let dist = frac * total;
      for (let seg = 0; seg < segLengths.length; seg++) {
        if (dist <= segLengths[seg] || seg === segLengths.length - 1) {
          const p0 = edge.pts[seg];
          const p1 = edge.pts[seg + 1];
          const local = segLengths[seg] ? dist / segLengths[seg] : 0;
          return {
            p: { x: p0.x + (p1.x - p0.x) * local, y: p0.y + (p1.y - p0.y) * local },
            angle: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI,
          };
        }
        dist -= segLengths[seg];
      }
      return { p: edge.pts[0], angle: 0 };
    },
  };
}

function pointOnPolyline(pts, frac) {
  const segLengths = [];
  let total = 0;
  for (let seg = 0; seg < pts.length - 1; seg++) {
    const len = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].y - pts[seg].y);
    segLengths.push(len);
    total += len;
  }
  let dist = Math.min(1, Math.max(0, frac)) * total;
  for (let seg = 0; seg < segLengths.length; seg++) {
    if (dist <= segLengths[seg] || seg === segLengths.length - 1) {
      const p0 = pts[seg];
      const p1 = pts[seg + 1];
      const local = segLengths[seg] ? dist / segLengths[seg] : 0;
      return {
        x: p0.x + (p1.x - p0.x) * local,
        y: p0.y + (p1.y - p0.y) * local,
        angle: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI,
      };
    }
    dist -= segLengths[seg];
  }
  return { x: pts[0].x, y: pts[0].y, angle: 0 };
}

export function trainLocator(geometry) {
  const laneCache = new Map();
  const lanePoints = (edgeId, lineId) => {
    const cacheKey = `${edgeId}#${lineId}`;
    let pts = laneCache.get(cacheKey);
    if (!pts) {
      const edge = geometry.edgeByKey.get(edgeId);
      if (!edge) {
        return null;
      }
      pts = offsetPolyline(edge.pts, edge.lines.includes(lineId) ? geometry.laneOffset(edge, lineId) : 0);
      laneCache.set(cacheKey, pts);
    }
    return pts;
  };
  const adjacency = new Map();
  for (const edge of geometry.edges) {
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)).push(edge.to);
    (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)).push(edge.from);
  }
  const findPath = (from, to) => {
    const parent = new Map([[from, from]]);
    const queue = [from];
    for (const node of queue) {
      if (node === to) {
        break;
      }
      for (const next of adjacency.get(node) ?? []) {
        if (!parent.has(next)) {
          parent.set(next, node);
          queue.push(next);
        }
      }
    }
    if (!parent.has(to)) {
      return null;
    }
    const path = [to];
    while (path[0] !== from) {
      path.unshift(parent.get(path[0]));
    }
    return path;
  };
  const routeCache = new Map();
  const routePoints = (from, to, lineId) => {
    const key = `${from}>${to}#${lineId}`;
    if (routeCache.has(key)) {
      return routeCache.get(key);
    }
    const hops = findPath(from, to);
    let pts = null;
    if (hops) {
      pts = [];
      for (let k = 0; k < hops.length - 1; k++) {
        const edgeId = edgeKey(hops[k], hops[k + 1]);
        const edge = geometry.edgeByKey.get(edgeId);
        const lane = lanePoints(edgeId, lineId);
        if (!edge || !lane) {
          pts = null;
          break;
        }
        const oriented = edge.from === hops[k] ? lane : [...lane].reverse();
        pts.push(...(pts.length ? oriented.slice(1) : oriented));
      }
    }
    routeCache.set(key, pts);
    return pts;
  };
  return (position) => {
    let from = position.from;
    let to = position.to;
    let frac = position.frac;
    if (from === to) {
      const prevStop = position.pattern.stations[position.index - 1];
      if (!prevStop) {
        const p = geometry.pos(from);
        return { x: p.x, y: p.y, angle: 0 };
      }
      from = prevStop;
      to = position.from;
      frac = 1;
    }
    const pts = routePoints(from, to, position.pattern.lineId);
    if (pts) {
      return pointOnPolyline(pts, frac);
    }
    return null;
  };
}
