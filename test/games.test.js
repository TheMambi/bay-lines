import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dailySeed,
  guessPoints,
  guessVerdict,
  pickStations,
  pickTrips,
  readBest,
  recordBest,
  shareText,
  sprintPoints,
  stopsBetween,
  WEEKDAY_DAY,
} from '../src/lib/games';
import { net } from '../src/lib/network';
import { planTrips } from '../src/lib/routing';

describe("today's set", () => {
  it('is the same for everyone on one date and differs by date and by game', () => {
    expect(dailySeed('2026-11-13', 'sprint')).toBe(dailySeed('2026-11-13', 'sprint'));
    expect(dailySeed('2026-11-13', 'sprint')).not.toBe(dailySeed('2026-11-14', 'sprint'));
    expect(dailySeed('2026-11-13', 'sprint')).not.toBe(dailySeed('2026-11-13', 'guess'));
  });

  it('gives a whole number the question pickers can use, on every day of a year', () => {
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const seed = dailySeed(date, 'sprint');
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 31, date).toBe(true);
    }
  });
});

describe('Station Sprint', () => {
  it('asks for ten different stations, the same ones for the same set', () => {
    for (const seed of [0, 1, 42, dailySeed('2026-11-13', 'sprint')]) {
      const stations = pickStations(net, seed);
      expect(stations).toHaveLength(10);
      expect(new Set(stations).size).toBe(10);
      expect(stations.every((id) => net.stationById.has(id))).toBe(true);
      expect(pickStations(net, seed)).toEqual(stations);
    }
    expect(pickStations(net, 1)).not.toEqual(pickStations(net, 2));
  });

  it('never asks for more stations than there are', () => {
    expect(pickStations(net, 5, 500)).toHaveLength(net.stations.length);
  });

  it('gives nothing for a wrong answer and more for a faster right one', () => {
    expect(sprintPoints(false, 0)).toBe(0);
    expect(sprintPoints(true, 0)).toBe(100);
    expect(sprintPoints(true, 6)).toBe(70);
    expect(sprintPoints(true, 12)).toBe(40);
    expect(sprintPoints(true, 600)).toBe(40);
    for (let seconds = 0; seconds < 15; seconds += 0.5) {
      expect(sprintPoints(true, seconds + 0.5)).toBeLessThanOrEqual(sprintPoints(true, seconds));
    }
  });

  it('counts how many stops off a wrong pick was', () => {
    expect(stopsBetween(net, 'EMBR', 'MONT')).toBe(1);
    expect(stopsBetween(net, 'EMBR', 'EMBR')).toBeNull();
  });
});

describe('Guess the Ride', () => {
  it('asks about eight different trips and holds the answer the trip planner gives', () => {
    for (const seed of [0, 1, 42, dailySeed('2026-11-13', 'guess')]) {
      const trips = pickTrips(net, seed);
      expect(trips).toHaveLength(8);
      const pairs = trips.map((trip) => [trip.from, trip.to].sort().join('|'));
      expect(new Set(pairs).size).toBe(8);
      for (const trip of trips) {
        const best = planTrips(net, WEEKDAY_DAY, trip.from, trip.to).itineraries[0];
        expect(trip.minutes, pairs).toBe(best.rideMinutes);
        expect(trip.transfers).toBe(best.transfers);
        expect(trip.minutes).toBeGreaterThanOrEqual(8);
        expect(trip.minutes).toBeLessThanOrEqual(95);
      }
      expect(pickTrips(net, seed)).toEqual(trips);
    }
  });

  it('takes five points off for each minute a guess is out, down to nothing', () => {
    expect(guessPoints(30, 30)).toBe(100);
    expect(guessPoints(27, 30)).toBe(85);
    expect(guessPoints(33.4, 30)).toBe(85);
    expect(guessPoints(50, 30)).toBe(0);
    expect(guessPoints(0, 95)).toBe(0);
  });

  it('puts the result into words', () => {
    expect(guessVerdict(30, 30)).toBe('spot on');
    expect(guessVerdict(33, 30)).toBe('close');
    expect(guessVerdict(27, 30)).toBe('close');
    expect(guessVerdict(20, 30)).toBe('too short');
    expect(guessVerdict(40, 30)).toBe('too long');
  });
});

describe('sharing and best scores', () => {
  afterEach(() => vi.unstubAllGlobals());

  const storage = (start = {}) => {
    const items = new Map(Object.entries(start));
    return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  };

  it('writes a score line that names the set', () => {
    expect(shareText('Station Sprint', { kind: 'today', date: '2026-11-13' }, 640, 1000, [100, 0, 70])).toBe(
      'Bay Lines · Station Sprint · today’s set (2026-11-13): 640 of 1000. Round by round: 100, 0, 70.',
    );
    expect(shareText('Guess the Ride', { kind: 'random' }, 5, 800, [5])).toContain('a random set: 5 of 800.');
  });

  it('keeps a best score per game and only replaces it with a higher one', () => {
    vi.stubGlobal('localStorage', storage());
    expect(readBest()).toEqual({ sprint: 0, guess: 0 });
    expect(recordBest('sprint', 500)).toEqual({ best: 500, isNew: true });
    expect(recordBest('sprint', 400)).toEqual({ best: 500, isNew: false });
    expect(recordBest('sprint', 500)).toEqual({ best: 500, isNew: false });
    expect(recordBest('guess', 300)).toEqual({ best: 300, isNew: true });
    expect(readBest()).toEqual({ sprint: 500, guess: 300 });
  });

  it('starts from zero when the stored scores are unreadable or storage is blocked', () => {
    vi.stubGlobal('localStorage', storage({ 'bay-lines-best': '{not json' }));
    expect(readBest()).toEqual({ sprint: 0, guess: 0 });
    vi.stubGlobal('localStorage', storage({ 'bay-lines-best': '{"sprint":"lots","guess":120}' }));
    expect(readBest()).toEqual({ sprint: 0, guess: 120 });
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    });
    expect(readBest()).toEqual({ sprint: 0, guess: 0 });
    expect(recordBest('guess', 50)).toEqual({ best: 50, isNew: true });
  });
});
