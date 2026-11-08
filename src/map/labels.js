const ANCHORS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

function anchorCandidates(anchor) {
  const start = ANCHORS.indexOf(anchor);
  const order = [anchor];
  for (const step of [1, -1, 2, -2, 3, -3, 4]) {
    order.push(ANCHORS[(start + step + 8) % 8]);
  }
  return order;
}

export function placeLabel({ sx, sy, standoff, width, height }, anchor) {
  const diag = standoff * 0.72;
  let x0 = 0;
  let y0 = 0;
  let textAnchor = 'start';
  switch (anchor) {
    case 'e':
      x0 = sx + standoff;
      y0 = sy - height / 2;
      break;
    case 'w':
      x0 = sx - standoff - width;
      y0 = sy - height / 2;
      textAnchor = 'end';
      break;
    case 'n':
      x0 = sx - width / 2;
      y0 = sy - standoff - height;
      textAnchor = 'middle';
      break;
    case 's':
      x0 = sx - width / 2;
      y0 = sy + standoff;
      textAnchor = 'middle';
      break;
    case 'ne':
      x0 = sx + diag;
      y0 = sy - diag - height;
      break;
    case 'nw':
      x0 = sx - diag - width;
      y0 = sy - diag - height;
      textAnchor = 'end';
      break;
    case 'se':
      x0 = sx + diag;
      y0 = sy + diag;
      break;
    case 'sw':
      x0 = sx - diag - width;
      y0 = sy + diag;
      textAnchor = 'end';
  }
  const x = textAnchor === 'start' ? x0 : textAnchor === 'end' ? x0 + width : x0 + width / 2;
  return { box: { x0, y0, x1: x0 + width, y1: y0 + height }, x, y: y0 + height / 2, textAnchor };
}

export const boxesOverlap = (a, b, pad = 2) =>
  a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

const boxHitsCircle = (box, circle) => {
  const cx = Math.max(box.x0, Math.min(circle.x, box.x1));
  const cy = Math.max(box.y0, Math.min(circle.y, box.y1));
  return (cx - circle.x) ** 2 + (cy - circle.y) ** 2 < (circle.r + 1) ** 2;
};

export const boxHitsSegment = (box, seg) => {
  const minX = box.x0 - seg.r;
  const maxX = box.x1 + seg.r;
  const minY = box.y0 - seg.r;
  const maxY = box.y1 + seg.r;
  if (
    Math.max(seg.ax, seg.bx) < minX ||
    Math.min(seg.ax, seg.bx) > maxX ||
    Math.max(seg.ay, seg.by) < minY ||
    Math.min(seg.ay, seg.by) > maxY
  ) {
    return false;
  }
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  let tMin = 0;
  let tMax = 1;
  const clip = (p, q) => {
    if (p === 0) {
      return q >= 0;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > tMax) {
        return false;
      }
      if (ratio > tMin) {
        tMin = ratio;
      }
    } else {
      if (ratio < tMin) {
        return false;
      }
      if (ratio < tMax) {
        tMax = ratio;
      }
    }
    return true;
  };
  return (
    clip(-dx, seg.ax - minX) && clip(dx, maxX - seg.ax) && clip(-dy, seg.ay - minY) && clip(dy, maxY - seg.ay)
  );
};

const pointSegmentDistance = (px, py, seg) => {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const lenSq = dx * dx + dy * dy;
  const proj = lenSq ? Math.max(0, Math.min(1, ((px - seg.ax) * dx + (py - seg.ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (seg.ax + proj * dx), py - (seg.ay + proj * dy));
};

export const circleHitsSegment = (cx, cy, radius, seg) => pointSegmentDistance(cx, cy, seg) < radius + seg.r;

export const circleHitsBox = (cx, cy, radius, box) => {
  const nx = Math.max(box.x0, Math.min(cx, box.x1));
  const ny = Math.max(box.y0, Math.min(cy, box.y1));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < radius * radius;
};

export function layoutLabels(
  candidates,
  markers,
  obstacles,
  viewport,
  maxRank,
  segments = [],
  softObstacles = [],
) {
  const ordered = candidates
    .map((label, index) => ({ l: label, i: index }))
    .sort((a, b) => a.l.rank - b.l.rank || a.i - b.i);
  const placed = [];
  for (const { l: cand } of ordered) {
    if (cand.rank > maxRank) {
      continue;
    }
    const blockers = cand.rank === 0 ? obstacles : [...obstacles, ...softObstacles];
    if (cand.sx < -200 || cand.sy < -100 || cand.sx > viewport.w + 200 || cand.sy > viewport.h + 100) {
      continue;
    }
    let placement = null;
    for (const anchor of anchorCandidates(cand.anchor)) {
      const { box, x, y, textAnchor } = placeLabel(cand, anchor);
      if (!(
        box.x0 < 4 ||
        box.y0 < 4 ||
        box.x1 > viewport.w - 4 ||
        box.y1 > viewport.h - 4 ||
        placed.some((other) => boxesOverlap(other.box, box)) ||
        blockers.some((obstacle) => boxesOverlap(obstacle, box, 1)) ||
        markers.some((marker) => marker.id !== cand.id && boxHitsCircle(box, marker)) ||
        segments.some((segment) => boxHitsSegment(box, segment))
      )) {
        placement = { id: cand.id, text: cand.text, x, y, textAnchor, anchor, rank: cand.rank, box };
        break;
      }
    }
    if (!placement && cand.rank === 0) {
      const vw = viewport.w;
      const vh = viewport.h;
      const overflow = (box) =>
        Math.max(0, 4 - box.x0) +
        Math.max(0, 4 - box.y0) +
        Math.max(0, box.x1 - (vw - 4)) +
        Math.max(0, box.y1 - (vh - 4));
      const penalty = (box) =>
        overflow(box) * 40 +
        blockers.filter((obstacle) => boxesOverlap(obstacle, box, 1)).length * 100 +
        placed.filter((other) => boxesOverlap(other.box, box)).length * 200 +
        markers.filter((marker) => marker.id !== cand.id && boxHitsCircle(box, marker)).length * 30 +
        markers.filter((marker) => marker.id === cand.id && boxHitsCircle(box, marker)).length * 150 +
        segments.filter((segment) => boxHitsSegment(box, segment)).length * 8;
      let bestScore = Infinity;
      let bestPenalty = Infinity;
      const consider = (spot, anchor, extra, dx, dy) => {
        const box = {
          x0: spot.box.x0 + dx,
          y0: spot.box.y0 + dy,
          x1: spot.box.x1 + dx,
          y1: spot.box.y1 + dy,
        };
        const pen = penalty(box);
        const score = extra * 0.4 + (Math.abs(dx) + Math.abs(dy) * 1.6) * 0.5 + pen;
        if (score < bestScore) {
          bestScore = score;
          bestPenalty = pen;
          placement = {
            id: cand.id,
            text: cand.text,
            x: spot.x + dx,
            y: spot.y + dy,
            textAnchor: spot.textAnchor,
            anchor,
            rank: 0,
            box,
          };
        }
      };
      for (const extra of [0, 12, 26, 44]) {
        for (const dir of anchorCandidates(cand.anchor)) {
          const spot = placeLabel({ ...cand, standoff: cand.standoff + extra }, dir);
          const shifts = [[0, 0]];
          const nudgeX = Math.max(0, 4 - spot.box.x0) + Math.min(0, vw - 4 - spot.box.x1);
          const nudgeY = Math.max(0, 4 - spot.box.y0) + Math.min(0, vh - 4 - spot.box.y1);
          if (nudgeX !== 0 || nudgeY !== 0) {
            shifts.push([nudgeX, nudgeY]);
          }
          for (const obstacle of blockers) {
            if (boxesOverlap(obstacle, spot.box, 1)) {
              shifts.push(
                [obstacle.x0 - 2 - spot.box.x1, 0],
                [obstacle.x1 + 2 - spot.box.x0, 0],
                [0, obstacle.y0 - 2 - spot.box.y1],
                [0, obstacle.y1 + 2 - spot.box.y0],
              );
            }
          }
          for (const [dx, dy] of shifts) {
            consider(spot, dir, extra, dx, dy);
          }
        }
      }
      if (bestPenalty >= 30) {
        const blocking = [...blockers, ...placed.map((other) => other.box)];
        for (const extra of [12, 26, 44, 70, 100]) {
          for (const dir of anchorCandidates(cand.anchor)) {
            const spot = placeLabel({ ...cand, standoff: cand.standoff + extra }, dir);
            const near = blocking.filter((b) => boxesOverlap(b, spot.box, 1)).slice(0, 3);
            const xs = [0, Math.max(0, 4 - spot.box.x0) + Math.min(0, vw - 4 - spot.box.x1)];
            const ys = [0, Math.max(0, 4 - spot.box.y0) + Math.min(0, vh - 4 - spot.box.y1)];
            for (const b of near) {
              xs.push(b.x0 - 2 - spot.box.x1, b.x1 + 2 - spot.box.x0);
              ys.push(b.y0 - 2 - spot.box.y1, b.y1 + 2 - spot.box.y0);
            }
            for (const dx of xs) {
              for (const dy of ys) {
                if (dx !== 0 || dy !== 0) {
                  consider(spot, dir, extra, dx, dy);
                }
              }
            }
          }
        }
      }
    }
    if (placement) {
      placed.push(placement);
    }
  }
  return placed;
}

export const LABEL_FONT =
  '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", system-ui, sans-serif';

const COMPASS = {
  n: { x: 0, y: -1 },
  ne: { x: 0.707, y: -0.707 },
  e: { x: 1, y: 0 },
  se: { x: 0.707, y: 0.707 },
  s: { x: 0, y: 1 },
  sw: { x: -0.707, y: 0.707 },
  w: { x: -1, y: 0 },
  nw: { x: -0.707, y: -0.707 },
};

export const nearestCompass = (dir) => {
  let best = 'e';
  let bestDot = -2;
  for (const [name, vec] of Object.entries(COMPASS)) {
    const dot = vec.x * dir.x + vec.y * dir.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = name;
    }
  }
  return best;
};

export function endOfLineBadges(net) {
  const ends = new Map();
  const through = new Map();
  for (const pattern of net.activePatterns({ day: 'weekday', period: 'day' })) {
    pattern.stations.forEach((stationId, index) => {
      const bucket = index === 0 || index === pattern.stations.length - 1 ? ends : through;
      if (!bucket.has(stationId)) {
        bucket.set(stationId, new Set());
      }
      bucket.get(stationId).add(pattern.lineId);
    });
  }
  const result = new Map();
  for (const [stationId, lineIds] of ends) {
    const endingHere = [...lineIds].filter(
      (lineId) => !through.get(stationId)?.has(lineId) && (lineId !== 'grey' || stationId !== 'COLS'),
    );
    if (endingHere.length) {
      result.set(stationId, endingHere);
    }
  }
  return result;
}
