import { describe, expect, it } from 'vitest';
import { MinHeap } from '../src/lib/minHeap';
import { DAYS, net } from '../src/lib/network';
import { scheduledTrains, trainsAt } from '../src/lib/replay';
import { buildGeometry, trainLocator } from '../src/map/geometry';
import {
  boxesOverlap,
  boxHitsSegment,
  circleHitsBox,
  circleHitsSegment,
  endOfLineBadges,
  layoutLabels,
  nearestCompass,
  placeLabel,
} from '../src/map/labels';
import { LANE_GAP } from '../src/map/schematic';

const geometry = buildGeometry(net);

describe('buildGeometry', () => {
  it('gives every station a symbol at its place on the map', () => {
    expect([...geometry.symbols.keys()].sort()).toEqual(net.stations.map((station) => station.id).sort());
    for (const symbol of geometry.symbols.values()) {
      expect(geometry.pos(symbol.id)).toEqual({ x: symbol.x, y: symbol.y });
      for (const value of [symbol.x, symbol.y, symbol.angle, symbol.half, symbol.thick]) {
        expect(Number.isFinite(value), symbol.id).toBe(true);
      }
      expect(symbol.x).toBeGreaterThanOrEqual(geometry.bounds.minX);
      expect(symbol.x).toBeLessThanOrEqual(geometry.bounds.maxX);
      expect(symbol.y).toBeGreaterThanOrEqual(geometry.bounds.minY);
      expect(symbol.y).toBeLessThanOrEqual(geometry.bounds.maxY);
    }
  });

  it('draws ends of the line as bars and interchanges as something wider than a dot', () => {
    for (const symbol of geometry.symbols.values()) {
      expect(symbol.terminal, symbol.id).toBe(net.isTerminal(symbol.id));
      expect(symbol.kind === 'bar', symbol.id).toBe(symbol.terminal);
      expect(symbol.interchange, symbol.id).toBe(net.isInterchange(symbol.id));
      if (symbol.interchange && !symbol.terminal) {
        expect(['disc', 'pill'], symbol.id).toContain(symbol.kind);
      }
    }
  });

  it('never puts two stations on the same spot', () => {
    const spots = new Set(net.stations.map((station) => JSON.stringify(geometry.pos(station.id))));
    expect(spots.size).toBe(net.stations.length);
  });

  it('spreads the lines of a shared track evenly around its middle', () => {
    for (const edge of geometry.edges) {
      const offsets = edge.lines.map((lineId) => geometry.laneOffset(edge, lineId));
      expect(
        offsets.reduce((sum, offset) => sum + offset, 0),
        edge.key,
      ).toBeCloseTo(0);
      for (let lane = 1; lane < offsets.length; lane++) {
        expect(offsets[lane] - offsets[lane - 1], edge.key).toBeCloseTo(LANE_GAP);
      }
    }
  });

  it('draws one lane path per line with a point for every corner', () => {
    for (const edge of geometry.edges) {
      for (const lineId of edge.lines) {
        const path = geometry.lanePath(edge, lineId);
        expect(path, `${edge.key} ${lineId}`).toMatch(/^M-?[\d.]+ -?[\d.]+(L-?[\d.]+ -?[\d.]+)+$/);
        expect(path.split('L')).toHaveLength(edge.pts.length);
      }
    }
  });

  it('walks a track segment from one end to the other', () => {
    for (const edge of geometry.edges) {
      const first = edge.pts[0];
      const last = edge.pts[edge.pts.length - 1];
      expect(geometry.pointAlong(edge, 0).p).toEqual(first);
      const end = geometry.pointAlong(edge, 1).p;
      expect(end.x).toBeCloseTo(last.x);
      expect(end.y).toBeCloseTo(last.y);
      if (edge.pts.length === 2) {
        const mid = geometry.pointAlong(edge, 0.5).p;
        expect(mid.x, edge.key).toBeCloseTo((first.x + last.x) / 2);
        expect(mid.y, edge.key).toBeCloseTo((first.y + last.y) / 2);
      }
    }
  });

  it('names the station or track segment the layout is missing', () => {
    const extraStation = { ...net, stations: [...net.stations, { id: 'NEW1' }] };
    expect(() => buildGeometry(extraStation)).toThrow('No layout for station NEW1');
    const edge = { key: '12TH|SFIA', a: '12TH', b: 'SFIA', lineIds: ['red'] };
    const extraTrack = { ...net, edges: [...net.edges, edge] };
    expect(() => buildGeometry(extraTrack)).toThrow('Track segment 12TH|SFIA is not in any corridor');
  });
});

describe('trainLocator', () => {
  const locate = trainLocator(geometry);
  const widest = Math.max(...geometry.edges.map((edge) => edge.lines.length));
  // Lanes sit up to half the widest track from the middle, and sharp corners push them out further.
  const slack = (widest - 1) * LANE_GAP + 1;

  it.each(DAYS)('puts every %s train on the map at every moment of the day', (day) => {
    const trains = scheduledTrains(net, day);
    const problems = [];
    for (let minute = 240; minute <= 1560; minute += 3) {
      for (const at of trainsAt(net, trains, minute)) {
        const point = locate(at);
        if (!point || ![point.x, point.y, point.angle].every(Number.isFinite)) {
          problems.push(`${at.train.id} at minute ${minute}: not drawn`);
          continue;
        }
        if (at.dwelling) {
          const station = geometry.pos(at.from);
          if (Math.hypot(point.x - station.x, point.y - station.y) > slack) {
            problems.push(`${at.train.id} at minute ${minute}: waits away from ${at.from}`);
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('moves a train from one station toward the next', () => {
    const pattern = net.patterns.find((candidate) => candidate.stations.length > 2);
    const [from, to] = pattern.stations;
    const leaving = locate({ pattern, index: 0, from, to, frac: 0 });
    const halfway = locate({ pattern, index: 0, from, to, frac: 0.5 });
    const arriving = locate({ pattern, index: 0, from, to, frac: 1 });
    const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(gap(leaving, geometry.pos(from))).toBeLessThanOrEqual(slack);
    expect(gap(arriving, geometry.pos(to))).toBeLessThanOrEqual(slack);
    expect(gap(leaving, halfway)).toBeCloseTo(gap(halfway, arriving), 0);
  });

  it('draws nothing for a ride between stations the map does not join', () => {
    const pattern = { lineId: 'red', stations: ['NOPE', 'RICH'] };
    expect(locate({ pattern, index: 0, from: 'NOPE', to: 'RICH', frac: 0.5 })).toBeNull();
  });
});

describe('placeLabel', () => {
  const station = { sx: 100, sy: 100, standoff: 10, width: 60, height: 14 };

  it.each([
    ['n', 'middle'],
    ['ne', 'start'],
    ['e', 'start'],
    ['se', 'start'],
    ['s', 'middle'],
    ['sw', 'end'],
    ['w', 'end'],
    ['nw', 'end'],
  ])('keeps a label to the %s clear of its station', (anchor, textAnchor) => {
    const placed = placeLabel(station, anchor);
    const { box } = placed;
    expect(box.x1 - box.x0).toBeCloseTo(60);
    expect(box.y1 - box.y0).toBeCloseTo(14);
    expect(placed.textAnchor).toBe(textAnchor);
    expect(placed.y).toBeCloseTo((box.y0 + box.y1) / 2);
    expect(placed.x).toBeCloseTo({ start: box.x0, middle: (box.x0 + box.x1) / 2, end: box.x1 }[textAnchor]);
    expect(circleHitsBox(100, 100, 7, box)).toBe(false);
    expect(circleHitsBox(100, 100, 11, box)).toBe(true);
    const side = { n: box.y1 < 100, s: box.y0 > 100, e: box.x0 > 100, w: box.x1 < 100 };
    for (const letter of anchor) {
      expect(side[letter], letter).toBe(true);
    }
  });
});

describe('label geometry helpers', () => {
  const box = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it('treats boxes closer than the padding as overlapping', () => {
    expect(boxesOverlap(box, { x0: 11, y0: 0, x1: 20, y1: 10 })).toBe(true);
    expect(boxesOverlap(box, { x0: 13, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(boxesOverlap(box, { x0: 11, y0: 0, x1: 20, y1: 10 }, 0)).toBe(false);
  });

  it('knows when a track runs through a label', () => {
    expect(boxHitsSegment(box, { ax: -20, ay: 5, bx: 30, by: 5, r: 2 })).toBe(true);
    expect(boxHitsSegment(box, { ax: -20, ay: -20, bx: 30, by: 30, r: 0 })).toBe(true);
    expect(boxHitsSegment(box, { ax: -20, ay: 20, bx: 30, by: 20, r: 2 })).toBe(false);
    expect(boxHitsSegment(box, { ax: 20, ay: -20, bx: 40, by: 0, r: 2 })).toBe(false);
  });

  it('measures a circle against a track and a box', () => {
    const track = { ax: 0, ay: 0, bx: 100, by: 0, r: 3 };
    expect(circleHitsSegment(50, 6, 4, track)).toBe(true);
    expect(circleHitsSegment(50, 8, 4, track)).toBe(false);
    expect(circleHitsSegment(110, 0, 4, track)).toBe(false);
    expect(circleHitsBox(14, 5, 5, box)).toBe(true);
    expect(circleHitsBox(16, 5, 5, box)).toBe(false);
  });

  it('turns a direction into the nearest of eight compass points', () => {
    expect(nearestCompass({ x: 1, y: 0 })).toBe('e');
    expect(nearestCompass({ x: 0, y: -1 })).toBe('n');
    expect(nearestCompass({ x: -0.6, y: 0.8 })).toBe('sw');
    expect(nearestCompass({ x: -1, y: 0.1 })).toBe('w');
  });
});

describe('layoutLabels', () => {
  const viewport = { w: 400, h: 300 };
  const label = (id, sx, sy, rank = 1, anchor = 'e') => ({
    id,
    text: id,
    rank,
    anchor,
    sx,
    sy,
    standoff: 8,
    width: 60,
    height: 14,
  });
  const marker = (id, x, y) => ({ id, x, y, r: 6 });
  const byId = (placed) => new Map(placed.map((entry) => [entry.id, entry]));

  it('gives each label the side it asked for while there is room', () => {
    const placed = layoutLabels([label('A', 100, 100), label('B', 100, 200, 1, 'w')], [], [], viewport, 3);
    expect(placed.map((entry) => [entry.id, entry.anchor])).toEqual([
      ['A', 'e'],
      ['B', 'w'],
    ]);
  });

  it('moves a label to another side to stay off its neighbors, their markers and the tracks', () => {
    const labels = [label('A', 100, 100), label('B', 130, 100), label('C', 100, 112)];
    const markers = labels.map((entry) => marker(entry.id, entry.sx, entry.sy));
    const track = { ax: 0, ay: 100, bx: 400, by: 100, r: 3 };
    const placed = layoutLabels(labels, markers, [], viewport, 3, [track]);
    expect(placed).toHaveLength(3);
    for (const entry of placed) {
      expect(boxHitsSegment(entry.box, track), entry.id).toBe(false);
      for (const other of placed) {
        if (other !== entry) {
          expect(boxesOverlap(entry.box, other.box), `${entry.id} ${other.id}`).toBe(false);
        }
      }
      for (const dot of markers) {
        if (dot.id !== entry.id) {
          expect(circleHitsBox(dot.x, dot.y, dot.r, entry.box), `${entry.id} ${dot.id}`).toBe(false);
        }
      }
    }
  });

  it('leaves out minor labels at a wide zoom and labels far outside the view', () => {
    const labels = [label('major', 100, 100, 0), label('minor', 100, 200, 2), label('away', 900, 100, 0)];
    expect(layoutLabels(labels, [], [], viewport, 1).map((entry) => entry.id)).toEqual(['major']);
    expect(layoutLabels(labels, [], [], viewport, 2).map((entry) => entry.id)).toEqual(['major', 'minor']);
  });

  it('keeps labels inside the view', () => {
    const placed = layoutLabels([label('corner', 390, 292, 0), label('edge', 395, 150)], [], [], viewport, 3);
    expect(placed).toHaveLength(2);
    for (const { box } of placed) {
      expect(box.x0 >= 4 && box.y0 >= 4 && box.x1 <= 396 && box.y1 <= 296).toBe(true);
    }
  });

  it('always names a main station, and drops a minor one that has nowhere to go', () => {
    const wall = { x0: 0, y0: 0, x1: 400, y1: 300 };
    expect(layoutLabels([label('minor', 200, 150, 2)], [], [wall], viewport, 3)).toEqual([]);
    const placed = byId(layoutLabels([label('major', 200, 150, 0)], [], [wall], viewport, 3));
    expect(placed.get('major').text).toBe('major');
    const soft = byId(
      layoutLabels(
        [label('major', 200, 150, 0), label('minor', 200, 250, 2)],
        [],
        [],
        viewport,
        3,
        [],
        [wall],
      ),
    );
    expect(soft.get('major').anchor).toBe('e');
    expect(soft.has('minor')).toBe(false);
  });
});

describe('endOfLineBadges', () => {
  it('marks where each line ends, and not the airport connector at Coliseum', () => {
    const badges = endOfLineBadges(net);
    const ends = Object.fromEntries(
      [...badges].map(([stationId, lineIds]) => [stationId, [...lineIds].sort()]),
    );
    expect(ends).toEqual({
      ANTC: ['yellow'],
      BERY: ['green', 'orange'],
      DALY: ['blue', 'green'],
      DUBL: ['blue'],
      MLBR: ['red'],
      OAKL: ['grey'],
      RICH: ['orange', 'red'],
      SFIA: ['yellow'],
    });
  });
});

describe('MinHeap', () => {
  it('hands back values in order of priority, whatever order they went in', () => {
    const heap = new MinHeap();
    const priorities = Array.from({ length: 200 }, (_, index) => (index * 7919) % 211);
    priorities.forEach((priority) => heap.push(priority, `v${priority}`));
    expect(heap.size).toBe(200);
    const out = [];
    while (heap.size) {
      out.push(heap.pop());
    }
    expect(out.map(([priority]) => priority)).toEqual([...priorities].sort((a, b) => a - b));
    expect(out.every(([priority, value]) => value === `v${priority}`)).toBe(true);
    expect(heap.pop()).toBeUndefined();
  });
});
