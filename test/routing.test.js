import { describe, expect, it } from 'vitest';
import { net } from '../src/lib/network';
import { planTrips } from '../src/lib/routing';

const WEEKDAY = { day: 'weekday', period: 'day' };

describe('planTrips', () => {
  it('finds a direct ride from Embarcadero to SFO', () => {
    const result = planTrips(net, WEEKDAY, 'EMBR', 'SFIA');
    expect(result.status).toBe('ok');
    const [best] = result.itineraries;
    expect(best.transfers).toBe(0);
    expect(['yellow', 'red']).toContain(best.legs[0].lineId);
    expect(best.legs[0].from).toBe('EMBR');
    expect(best.legs.at(-1).to).toBe('SFIA');
  });

  it('needs a transfer between Richmond and Dublin/Pleasanton', () => {
    const result = planTrips(net, WEEKDAY, 'RICH', 'DUBL');
    expect(result.status).toBe('ok');
    expect(result.itineraries[0].transfers).toBeGreaterThanOrEqual(1);
    expect(result.itineraries[0].legs.at(-1).lineId).toBe('blue');
  });

  it('flags the Oakland Airport Connector transfer at Coliseum', () => {
    const result = planTrips(net, WEEKDAY, 'OAKL', 'EMBR');
    expect(result.status).toBe('ok');
    const [first] = result.itineraries[0].legs;
    expect(first.lineId).toBe('grey');
    expect(first.notes).toContain('oac-transfer');
  });

  it('chains legs so each starts where the previous one ended', () => {
    for (const [from, to] of [
      ['ANTC', 'MLBR'],
      ['BERY', 'RICH'],
      ['DALY', 'DUBL'],
    ]) {
      const result = planTrips(net, WEEKDAY, from, to);
      expect(result.status).toBe('ok');
      for (const itinerary of result.itineraries) {
        itinerary.legs.forEach((leg, i) => {
          if (i > 0) expect(leg.from).toBe(itinerary.legs[i - 1].to);
        });
        expect(itinerary.legs[0].from).toBe(from);
        expect(itinerary.legs.at(-1).to).toBe(to);
      }
    }
  });

  it('reports same and unknown stations instead of routing', () => {
    expect(planTrips(net, WEEKDAY, 'EMBR', 'EMBR').status).toBe('same-station');
    expect(planTrips(net, WEEKDAY, 'EMBR', 'NOPE')).toEqual({ status: 'unknown-station', ids: ['NOPE'] });
  });

  it('returns the same object for repeated queries (memoised)', () => {
    expect(planTrips(net, WEEKDAY, 'MCAR', 'POWL')).toBe(planTrips(net, WEEKDAY, 'MCAR', 'POWL'));
  });
});

describe('fares', () => {
  it('has a positive adult fare between distinct stations and none for the same station', () => {
    expect(net.fareCents('EMBR', 'SFIA')).toBeGreaterThan(0);
    expect(net.fareCents('EMBR', 'EMBR')).toBeNull();
  });
});
