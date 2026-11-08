import { describe, expect, it } from 'vitest';
import { net } from '../src/lib/network';
import { computeReach, meetingPoints, reachBand, summarizeReach } from '../src/lib/reach';

const WEEKDAY = { day: 'weekday', period: 'day' };

describe('computeReach', () => {
  const reach = computeReach(net, WEEKDAY, 'MCAR');

  it('starts at zero minutes and reaches every station in weekday service', () => {
    expect(reach.get('MCAR').minutes).toBe(0);
    expect(reach.size).toBe(net.stations.length);
  });

  it('adds the chosen first wait and transfer allowance', () => {
    const slower = computeReach(net, WEEKDAY, 'MCAR', 10, 5);
    for (const [id, entry] of reach) {
      if (id === 'MCAR') continue;
      expect(slower.get(id).minutes).toBeGreaterThanOrEqual(entry.minutes + 5);
    }
  });

  it('summarises how many stations are within the horizon', () => {
    const summary = summarizeReach(reach, 'MCAR', 30, net.stations.length);
    expect(summary.others).toBe(net.stations.length - 1);
    expect(summary.within).toBeGreaterThan(0);
    expect(summary.farthest.minutes).toBeLessThanOrEqual(30);
  });
});

describe('reachBand', () => {
  it('splits the horizon into five bands and excludes anything beyond it', () => {
    expect(reachBand(0, 30)).toBe(0);
    expect(reachBand(29, 30)).toBe(4);
    expect(reachBand(31, 30)).toBeNull();
  });
});

describe('meetingPoints', () => {
  it('ranks by whoever arrives last', () => {
    const points = meetingPoints(computeReach(net, WEEKDAY, 'RICH'), computeReach(net, WEEKDAY, 'DUBL'));
    expect(points.length).toBeGreaterThan(0);
    for (let i = 1; i < points.length; i++)
      expect(points[i].minutes).toBeGreaterThanOrEqual(points[i - 1].minutes);
    expect(points[0].minutes).toBe(Math.max(points[0].a.minutes, points[0].b.minutes));
  });
});
