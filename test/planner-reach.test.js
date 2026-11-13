import { describe, expect, it } from 'vitest';
import { buildServiceGraph, shortestPaths } from '../src/lib/graph';
import { DAYS, PERIODS, net } from '../src/lib/network';
import { computeReach } from '../src/lib/reach';
import { planTrips } from '../src/lib/routing';

const SERVICES = DAYS.flatMap((day) => PERIODS.map((period) => ({ day, period })));
const IDS = net.stations.map((station) => station.id);
const label = (service, from, to) => `${service.day} ${service.period} ${from} to ${to}`;

// Runs `check` for every ordered station pair in all six services and returns what it reported.
function everyPair(check) {
  const problems = [];
  for (const service of SERVICES) {
    for (const from of IDS) {
      for (const to of IDS) {
        if (from !== to) {
          check(service, from, to, (message) => problems.push(`${label(service, from, to)}: ${message}`));
        }
      }
    }
  }
  return problems;
}

// The cheapest way to every station under the planner's own rule (8 minutes for each boarding plus the
// scheduled minutes between departures), found by plain repeated relaxation. It shares no code with
// the app's search, so it can catch a regression there.
function cheapestFrom(service, from) {
  const patterns = net.activePatterns(service);
  const atStation = new Map(IDS.map((id) => [id, Infinity]));
  atStation.set(from, 0);
  const onBoard = patterns.map((pattern) => pattern.stations.map(() => Infinity));
  for (let changed = true; changed;) {
    changed = false;
    const lower = (current, candidate, store) => {
      if (candidate < current - 1e-9) {
        store(candidate);
        changed = true;
      }
    };
    patterns.forEach((pattern, p) => {
      pattern.stations.forEach((stationId, i) => {
        if (i < pattern.stations.length - 1) {
          lower(onBoard[p][i], atStation.get(stationId) + 8, (cost) => (onBoard[p][i] = cost));
          const ride = Math.max(0.5, pattern.dep[i + 1] - pattern.dep[i]);
          lower(onBoard[p][i + 1], onBoard[p][i] + ride, (cost) => (onBoard[p][i + 1] = cost));
        }
        if (i > 0) {
          lower(atStation.get(stationId), onBoard[p][i], (cost) => atStation.set(stationId, cost));
        }
      });
    });
  }
  return atStation;
}

const ownSchedule = (leg) => {
  const pattern = net.patternById.get(leg.patternId);
  const start = pattern.stations.indexOf(leg.from);
  const end = start + leg.stops.length - 1;
  return { pattern, start, end };
};

describe('route search shared by the trip planner and Reach', () => {
  it('finds a way to every station as cheap as an independent search does, in every service', () => {
    const problems = [];
    for (const service of SERVICES) {
      const graph = buildServiceGraph(net, service);
      for (const from of IDS) {
        const { dist } = shortestPaths(graph, from);
        const cheapest = cheapestFrom(service, from);
        for (const to of IDS) {
          const cost = dist[graph.stationIndex.get(to)];
          // The search adds a tie-break of well under a tenth of a minute to prefer busier trains.
          if (!(Math.abs(cost - cheapest.get(to)) < 0.1)) {
            problems.push(
              `${label(service, from, to)}: cost ${cost}, independent search ${cheapest.get(to)}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('trip planner, every station pair in every service', () => {
  it('returns a route whose legs join up from the start to the destination', () => {
    const problems = everyPair((service, from, to, report) => {
      const result = planTrips(net, service, from, to);
      if (result.status !== 'ok') {
        report(`status ${result.status}`);
        return;
      }
      for (const itinerary of result.itineraries) {
        const ends = itinerary.legs.map((leg) => `${leg.from}>${leg.to}`);
        const joined = itinerary.legs.every((leg, i) => i === 0 || leg.from === itinerary.legs[i - 1].to);
        if (itinerary.legs[0]?.from !== from || itinerary.legs.at(-1)?.to !== to || !joined) {
          report(`legs ${ends.join(' ')}`);
        }
      }
    });
    expect(problems).toEqual([]);
  });

  it('never offers a route that passes the same station twice', () => {
    const problems = everyPair((service, from, to, report) => {
      planTrips(net, service, from, to).itineraries.forEach((itinerary, option) => {
        const visited = itinerary.legs.flatMap((leg, i) => (i === 0 ? leg.stops : leg.stops.slice(1)));
        if (new Set(visited).size !== visited.length) {
          report(`option ${option + 1} runs ${visited.join(' ')}`);
        }
      });
    });
    expect(problems).toEqual([]);
  });

  it('shows each leg with the scheduled minutes of the train it names', () => {
    const problems = everyPair((service, from, to, report) => {
      for (const itinerary of planTrips(net, service, from, to).itineraries) {
        for (const leg of itinerary.legs) {
          const { pattern, start, end } = ownSchedule(leg);
          const scheduled = Math.max(1, Math.round(pattern.arr[end] - pattern.dep[start]));
          if (leg.minutes !== scheduled) {
            report(
              `${leg.from} to ${leg.to} on ${leg.patternId} shows ${leg.minutes}, schedule ${scheduled}`,
            );
          }
        }
      }
    });
    expect(problems).toEqual([]);
  });
});

describe('Reach and the trip planner', () => {
  // [minutes for each transfer, minutes waiting for the first train]: none, the defaults, the maximum.
  const SETTINGS = [
    [0, 0],
    [5, 0],
    [15, 15],
  ];

  it('take the same route to every station, so they agree on what is within any time budget', () => {
    const problems = [];
    for (const service of SERVICES) {
      for (const from of IDS) {
        for (const [transfer, firstWait] of SETTINGS) {
          const reach = computeReach(net, service, from, transfer, firstWait);
          for (const to of IDS) {
            if (to === from) {
              continue;
            }
            const [planned] = planTrips(net, service, from, to).itineraries;
            const expected = {
              minutes: planned.rideMinutes + firstWait + planned.transfers * transfer,
              rideMinutes: planned.rideMinutes,
              transfers: planned.transfers,
              lineIds: planned.legs.map((leg) => leg.lineId),
            };
            const entry = reach.get(to);
            const same =
              entry?.minutes === expected.minutes &&
              entry.rideMinutes === expected.rideMinutes &&
              entry.transfers === expected.transfers &&
              entry.lineIds.join() === expected.lineIds.join();
            if (!same) {
              problems.push(
                `${label(service, from, to)} with ${transfer} and ${firstWait}: Reach ${JSON.stringify(entry)}, planner ${JSON.stringify(expected)}`,
              );
            }
          }
          for (let budget = 10; budget <= 90; budget += 5) {
            const inReach = IDS.filter((to) => to !== from && reach.get(to).minutes <= budget);
            const inPlanner = IDS.filter((to) => {
              const planned = planTrips(net, service, from, to).itineraries?.[0];
              return planned && planned.rideMinutes + firstWait + planned.transfers * transfer <= budget;
            });
            if (inReach.join() !== inPlanner.join()) {
              problems.push(`${service.day} ${service.period} from ${from} within ${budget} minutes`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('never lists a one-seat ride with a transfer, even with the transfer time at none', () => {
    const problems = [];
    let oneSeatRides = 0;
    for (const service of SERVICES) {
      const patterns = net.activePatterns(service);
      for (const from of IDS) {
        const reach = computeReach(net, service, from, 0, 0);
        for (const to of IDS) {
          const oneSeat = patterns.some((pattern) => {
            const boarded = pattern.stations.indexOf(from);
            return boarded >= 0 && pattern.stations.indexOf(to, boarded + 1) > boarded;
          });
          if (oneSeat) {
            oneSeatRides++;
            if (reach.get(to).transfers !== 0) {
              problems.push(`${label(service, from, to)}: ${reach.get(to).transfers} transfers`);
            }
          }
        }
      }
    }
    expect(oneSeatRides).toBeGreaterThan(9000);
    expect(problems).toEqual([]);
  });
});
