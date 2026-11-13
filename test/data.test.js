import { describe, expect, it } from 'vitest';
import { STOP_PARENTS } from '../api/_lib/stop-parents.js';
import { assertNetwork, net } from '../src/lib/network';
import { buildGeometry } from '../src/map/geometry';
import { STATION_LAYOUT } from '../src/map/schematic';

const stationIds = net.stations.map((station) => station.id);

describe('network.json', () => {
  it('only uses stations and lines it defines', () => {
    for (const pattern of net.patterns) {
      expect(net.lineById.has(pattern.lineId), pattern.id).toBe(true);
      for (const stationId of pattern.stations) {
        expect(net.stationById.has(stationId), `${pattern.id} ${stationId}`).toBe(true);
      }
    }
  });

  it('gives every pattern one arrival and one departure minute per stop', () => {
    for (const pattern of net.patterns) {
      for (const minutes of [pattern.arr, pattern.dep]) {
        expect(minutes, pattern.id).toHaveLength(pattern.stations.length);
        expect(minutes.every(Number.isFinite), pattern.id).toBe(true);
      }
    }
  });

  it('has a square fare table over every station for each fare category', () => {
    const order = net.data.fares.stationOrder;
    expect([...order].sort()).toEqual([...stationIds].sort());
    for (const category of net.data.fares.categories) {
      expect(category.cents, category.id).toHaveLength(order.length);
      for (const row of category.cents) {
        expect(row, category.id).toHaveLength(order.length);
        expect(row.every(Number.isFinite), category.id).toBe(true);
      }
    }
  });
});

describe('assertNetwork', () => {
  const broken = (change) => {
    const data = structuredClone(net.data);
    change(data);
    return () => assertNetwork(data);
  };

  it('accepts the shipped data', () => {
    expect(() => assertNetwork(net.data)).not.toThrow();
  });

  it('names the pattern whose stop times do not line up with its stops', () => {
    const id = net.data.patterns[0].id;
    expect(broken((data) => data.patterns[0].dep.pop())).toThrow(
      `network.json: pattern ${id} needs one arrival and one departure minute for each stop`,
    );
    expect(broken((data) => (data.patterns[0].arr[1] = null))).toThrow(`pattern ${id} needs`);
  });

  it('names an unknown station or line', () => {
    const id = net.data.patterns[0].id;
    expect(broken((data) => (data.patterns[0].stations[1] = 'NOPE'))).toThrow(
      `network.json: pattern ${id} stops at unknown station NOPE`,
    );
    expect(broken((data) => (data.patterns[0].lineId = 'pink'))).toThrow(
      `network.json: pattern ${id} runs on unknown line pink`,
    );
  });

  it('rejects a fare table that does not cover every station', () => {
    expect(broken((data) => data.fares.categories[0].cents[3].pop())).toThrow(
      `network.json: fare table ${net.data.fares.categories[0].id} is not a full grid of numbers`,
    );
    expect(broken((data) => data.fares.stationOrder.pop())).toThrow('network.json: the fare tables');
  });

  it('rejects a file with a missing section', () => {
    expect(broken((data) => delete data.patterns)).toThrow('network.json: "patterns" must be a list');
    expect(broken((data) => (data.stations = []))).toThrow('network.json: "stations" must be a list');
  });
});

describe('map layout', () => {
  it('places every station, and nothing else', () => {
    expect(Object.keys(STATION_LAYOUT).sort()).toEqual([...stationIds].sort());
  });

  it('can draw every track segment', () => {
    const geometry = buildGeometry(net);
    expect(geometry.edges).toHaveLength(net.edges.length);
    for (const edge of geometry.edges) {
      for (const lineId of edge.lines) {
        expect(geometry.lanePath(edge, lineId), `${edge.key} ${lineId}`).not.toContain('NaN');
      }
    }
  });
});

describe('alerts platform map', () => {
  it('maps every platform to a station the app knows', () => {
    for (const [platform, stationId] of Object.entries(STOP_PARENTS)) {
      expect(net.stationById.has(stationId), `${platform} -> ${stationId}`).toBe(true);
    }
  });
});
