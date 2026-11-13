import { describe, expect, it } from 'vitest';
import { net } from '../src/lib/network';
import { buildGeometry } from '../src/map/geometry';
import { nearestStation } from '../src/map/hitTest';

describe('nearestStation', () => {
  const targets = [
    { id: 'A', x: 0, y: 0, r: 10 },
    { id: 'B', x: 8, y: 0, r: 10 },
    { id: 'C', x: 100, y: 0, r: 10 },
  ];

  it('picks the nearest center where circles overlap, whatever the drawing order', () => {
    expect(nearestStation(targets, { x: 0, y: 0 })).toBe('A');
    expect(nearestStation(targets, { x: 3, y: 0 })).toBe('A');
    expect(nearestStation(targets, { x: 5, y: 0 })).toBe('B');
    expect(nearestStation([...targets].reverse(), { x: 0, y: 0 })).toBe('A');
    expect(nearestStation([...targets].reverse(), { x: 5, y: 0 })).toBe('B');
  });

  it('only considers circles that contain the point', () => {
    expect(nearestStation(targets, { x: 50, y: 0 })).toBeNull();
    const unequal = [
      { id: 'big', x: 0, y: 0, r: 20 },
      { id: 'small', x: 20, y: 0, r: 5 },
    ];
    expect(nearestStation(unequal, { x: 12, y: 0 })).toBe('big');
    expect(nearestStation(unequal, { x: 16, y: 0 })).toBe('small');
  });
});

describe('nearestStation on the real map layout', () => {
  const geometry = buildGeometry(net);
  const centers = net.stations.map((station) => ({ id: station.id, ...geometry.pos(station.id) }));
  // Hit circles are 30 px wide on screen, so in map units they grow as the map shrinks.
  const targetsAt = (zoom) => centers.map((center) => ({ ...center, r: 15 / zoom }));
  const MIN_ZOOM = 0.26;

  it('has overlapping hit circles at the smallest zoom, where drawing order picked a neighbor', () => {
    const targets = targetsAt(MIN_ZOOM);
    const covered = targets.filter((target, index) =>
      targets.slice(index + 1).some((later) => Math.hypot(later.x - target.x, later.y - target.y) < later.r),
    );
    expect(covered.length).toBeGreaterThan(0);
  });

  it('resolves the center of every station to that station at every zoom', () => {
    for (const zoom of [MIN_ZOOM, 0.3662, 0.5, 1, 4]) {
      const targets = targetsAt(zoom);
      for (const center of centers) {
        expect(nearestStation(targets, center), `${center.id} at zoom ${zoom}`).toBe(center.id);
      }
    }
  });

  it('keeps a tap that lands off center, toward the closest neighbor, on the station it is nearer to', () => {
    const targets = targetsAt(MIN_ZOOM);
    for (const center of centers) {
      const neighbor = centers
        .filter((other) => other.id !== center.id)
        .map((other) => ({ ...other, gap: Math.hypot(other.x - center.x, other.y - center.y) }))
        .sort((a, b) => a.gap - b.gap)[0];
      expect(neighbor.gap, `${center.id} shares a spot with ${neighbor.id}`).toBeGreaterThan(0);
      const reach = Math.min(0.4 * neighbor.gap, 0.9 * (15 / MIN_ZOOM)) / neighbor.gap;
      const point = {
        x: center.x + (neighbor.x - center.x) * reach,
        y: center.y + (neighbor.y - center.y) * reach,
      };
      expect(nearestStation(targets, point), `${center.id} toward ${neighbor.id}`).toBe(center.id);
    }
  });
});
