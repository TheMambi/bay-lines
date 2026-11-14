import { describe, expect, it } from 'vitest';
import { lastTrainAt } from '../src/lib/graph';
import { net } from '../src/lib/network';
import { computeReach } from '../src/lib/reach';
import { planTrips } from '../src/lib/routing';
import { serviceAt, serviceMinuteNow } from '../src/lib/time';

const IDS = net.stations.map((station) => station.id);
const WEEKDAY = { day: 'weekday', period: 'day' };

// What the app works out from the clock for the "Right now" service. Pacific time is UTC-8 in November;
// the 12th is a Thursday, the 14th a Saturday and the 15th a Sunday.
const rightNow = (clock, date = '2026-11-12') => {
  const moment = new Date(`${date}T${clock}:00-08:00`);
  return { service: serviceAt(moment, net.data.meta.serviceDateOverrides), minute: serviceMinuteNow(moment) };
};

const planAt = (clock, from, to, date) => {
  const { service, minute } = rightNow(clock, date);
  return planTrips(net, service, from, to, minute);
};

const linesOf = (result) => result.itineraries.map((itinerary) => itinerary.legs.map((leg) => leg.lineId));

describe('trip planner with the "Right now" service', () => {
  it('offers no Green line ride from Daly City at 8 pm, after the last one left at 7:20', () => {
    const result = planAt('20:00', 'DALY', 'BERY');
    expect(result.status).toBe('ok');
    expect(result.itineraries[0].transfers).toBeGreaterThanOrEqual(1);
    expect(linesOf(result).flat()).not.toContain('green');
    expect(result.lastTrain).toEqual({
      lineId: 'green',
      toward: 'BERY',
      stationId: 'DALY',
      minute: 19 * 60 + 20,
      gone: true,
    });
  });

  it('offers the direct Green line ride at midday, with no last train to report', () => {
    const result = planAt('12:00', 'DALY', 'BERY');
    expect(linesOf(result)[0]).toEqual(['green']);
    expect(result.lastTrain).toBeUndefined();
    expect(result.itineraries).toEqual(planTrips(net, WEEKDAY, 'DALY', 'BERY').itineraries);
  });

  it('keeps a service the rider picked as it was, whatever the time', () => {
    const result = planTrips(net, WEEKDAY, 'DALY', 'BERY');
    expect(linesOf(result)[0]).toEqual(['green']);
    expect(result.lastTrain).toBeUndefined();
  });

  it('drops the Green and Red rides the audit found on offer after their last trains', () => {
    for (const [clock, from, to, line] of [
      ['20:30', 'FRMT', 'DALY', 'green'],
      ['20:30', 'DALY', 'BERY', 'green'],
      ['20:00', '16TH', 'FRMT', 'green'],
      ['20:00', 'RICH', 'SFIA', 'red'],
    ]) {
      const result = planAt(clock, from, to);
      expect(result.status, `${from} to ${to}`).toBe('ok');
      expect(linesOf(result).flat(), `${from} to ${to}`).not.toContain(line);
      expect(result.lastTrain, `${from} to ${to}`).toMatchObject({
        lineId: line,
        stationId: from,
        gone: true,
      });
    }
  });

  it('finds no train left for Millbrae before 9 pm once the last Red line train has passed', () => {
    // Only the Red line serves Millbrae before 9 pm. The evening service that follows is a separate
    // choice in the service list, so the planner reports the day's regular trains as finished.
    for (const from of ['RICH', '12TH']) {
      const result = planAt('20:00', from, 'MLBR');
      expect(result).toMatchObject({ status: 'no-route', ended: true });
      expect(result.lastTrain).toMatchObject({ lineId: 'red', toward: 'MLBR', stationId: from, gone: true });
    }
    expect(planAt('20:00', 'RICH', 'MLBR').lastTrain.minute).toBe(19 * 60 + 31);
    expect(planAt('21:10', 'RICH', 'MLBR').status).toBe('ok');
  });

  it('drops a connection whose last train leaves before the rider could reach it', () => {
    // At 7:10 pm the last Green line train has not left Daly City yet (7:20), but a rider starting at
    // SFO cannot be there before 7:27.
    const result = planAt('19:10', 'SFIA', 'BERY');
    expect(planTrips(net, WEEKDAY, 'SFIA', 'BERY').itineraries[0].legs[1].lineId).toBe('green');
    expect(linesOf(result).flat()).not.toContain('green');
    expect(result.lastTrain).toMatchObject({ lineId: 'green', gone: false });
  });

  it(
    'never has a rider board after the last train of that pattern, on sample evenings for every pair',
    { timeout: 60_000 },
    () => {
      // The earliest a rider can be at a stop: the fastest train over each earlier leg and no waiting.
      const fastest = (service, stops) =>
        Math.min(
          ...net.activePatterns(service).flatMap((pattern) => {
            const start = pattern.stations.indexOf(stops[0]);
            const runs = start >= 0 && stops.every((stop, k) => pattern.stations[start + k] === stop);
            return runs ? [pattern.arr[start + stops.length - 1] - pattern.dep[start]] : [];
          }),
        );
      const problems = [];
      let changed = 0;
      for (const [clock, date] of [
        ['19:00'],
        ['20:00'],
        ['20:55'],
        ['23:30'],
        ['00:30', '2026-11-13'],
        ['20:00', '2026-11-14'],
      ]) {
        const { service, minute } = rightNow(clock, date);
        for (const from of IDS) {
          for (const to of IDS) {
            const result = planTrips(net, service, from, to, minute);
            if (result.lastTrain) {
              changed++;
            }
            for (const itinerary of result.itineraries ?? []) {
              let ridden = 0;
              for (const leg of itinerary.legs) {
                const pattern = net.patternById.get(leg.patternId);
                const last = lastTrainAt(pattern, pattern.stations.indexOf(leg.from), service.day);
                if (minute + ridden > last) {
                  problems.push(`${clock} ${from} to ${to}: ${leg.patternId} at ${leg.from}, last ${last}`);
                }
                ridden += fastest(service, leg.stops);
              }
            }
          }
        }
      }
      expect(changed).toBeGreaterThan(1000);
      expect(problems).toEqual([]);
    },
  );

  it('says the regular trains have finished once none is left for the trip', () => {
    const result = planAt('01:30', 'DALY', 'BERY', '2026-11-13');
    expect(result).toMatchObject({ status: 'no-route', ended: true });
    expect(result.itineraries).toBeUndefined();
    expect(planTrips(net, rightNow('01:30', '2026-11-13').service, 'DALY', 'BERY').status).toBe('ok');
  });

  it('hands back the same object from minute to minute while the answer is unchanged', () => {
    const noon = planTrips(net, WEEKDAY, 'EMBR', 'DUBL', 720);
    expect(planTrips(net, WEEKDAY, 'EMBR', 'DUBL', 721)).toBe(noon);
    expect(planTrips(net, WEEKDAY, 'EMBR', 'DUBL', 722)).toBe(noon);
    expect(planTrips(net, WEEKDAY, 'EMBR', 'EMBR', 721)).toBe(planTrips(net, WEEKDAY, 'EMBR', 'EMBR', 720));
    expect(planTrips(net, WEEKDAY, 'DALY', 'BERY', 1200)).not.toBe(
      planTrips(net, WEEKDAY, 'DALY', 'BERY', 720),
    );
  });
});

describe('Reach with the "Right now" service', () => {
  it('agrees with the trip planner on every station at 8 pm and after the last trains', () => {
    const problems = [];
    let unreachable = 0;
    for (const [clock, date] of [['20:00'], ['00:30', '2026-11-13']]) {
      const { service, minute } = rightNow(clock, date);
      for (const from of IDS) {
        const reach = computeReach(net, service, from, 5, 0, minute);
        for (const to of IDS) {
          if (to === from) {
            continue;
          }
          const planned = planTrips(net, service, from, to, minute).itineraries?.[0];
          const entry = reach.get(to);
          if (!planned || !entry) {
            unreachable++;
          }
          const same = planned
            ? entry?.minutes === planned.rideMinutes + 5 * planned.transfers &&
              entry.lineIds.join() === planned.legs.map((leg) => leg.lineId).join()
            : entry === undefined;
          if (!same) {
            problems.push(`${clock} ${from} to ${to}: Reach ${JSON.stringify(entry)}`);
          }
        }
      }
    }
    expect(unreachable).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it('hands back the same map from minute to minute while nothing changes', () => {
    const noon = computeReach(net, WEEKDAY, 'EMBR', 5, 0, 720);
    expect(computeReach(net, WEEKDAY, 'EMBR', 5, 0, 721)).toBe(noon);
    expect(computeReach(net, WEEKDAY, 'EMBR', 5, 0, 721)).toEqual(computeReach(net, WEEKDAY, 'EMBR', 5, 0));
  });
});
