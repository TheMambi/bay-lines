import { planTrips } from './routing';

export const WEEKDAY_DAY = { day: 'weekday', period: 'day' };

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailySeed(date, game) {
  let hash = 2166136261;
  for (const ch of `bay-lines|${game}|${date}`) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 1;
}

export function shareText(game, set, score, total, rounds) {
  return `Bay Lines · ${game} · ${set.kind === 'today' ? `today’s set (${set.date})` : 'a random set'}: ${score} of ${total}. Round by round: ${rounds.join(', ')}.`;
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickStations(net, seed, count = 10) {
  return shuffle(
    net.stations.map((station) => station.id),
    seededRandom(seed),
  ).slice(0, Math.min(count, net.stations.length));
}

export function sprintPoints(correct, seconds) {
  if (!correct) {
    return 0;
  }
  const speed = Math.max(0, Math.min(1, 1 - seconds / 12));
  return Math.round(40 + 60 * speed);
}

export function stopsBetween(net, picked, toId) {
  const plan = planTrips(net, WEEKDAY_DAY, picked, toId);
  if (plan.status === 'ok') {
    return plan.itineraries[0].stopCount;
  }
  return null;
}

export function pickTrips(net, seed, count = 8) {
  const random = seededRandom(seed);
  const ids = net.stations.map((station) => station.id);
  const trips = [];
  const used = new Set();
  let attempts = 0;
  while (trips.length < count && attempts++ < 2000) {
    const from = ids[Math.floor(random() * ids.length)];
    const to = ids[Math.floor(random() * ids.length)];
    if (from === to || used.has(`${from}|${to}`) || used.has(`${to}|${from}`)) {
      continue;
    }
    const plan = planTrips(net, WEEKDAY_DAY, from, to);
    if (plan.status !== 'ok') {
      continue;
    }
    const best = plan.itineraries[0];
    if (!(best.rideMinutes < 8 || best.rideMinutes > 95)) {
      used.add(`${from}|${to}`);
      trips.push({ from, to, minutes: best.rideMinutes, transfers: best.transfers });
    }
  }
  return trips;
}

export function guessPoints(guess, minutes) {
  return Math.max(0, 100 - 5 * Math.abs(Math.round(guess) - minutes));
}

export function guessVerdict(guess, minutes) {
  const diff = guess - minutes;
  if (diff === 0) {
    return 'spot on';
  }
  if (Math.abs(diff) <= 3) {
    return 'close';
  }
  if (diff < 0) {
    return 'too short';
  }
  return 'too long';
}

export const EMPTY_GAME = { hideNames: false, marks: new Map(), from: null, to: null, itinerary: null };

const BEST_KEY = 'bay-lines-best';

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function readBest() {
  try {
    const stored = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
    return { sprint: Number(stored.sprint) || 0, guess: Number(stored.guess) || 0 };
  } catch {
    return { sprint: 0, guess: 0 };
  }
}

export function recordBest(game, best) {
  const current = readBest();
  if (best <= current[game]) {
    return { best: current[game], isNew: false };
  }
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...current, [game]: best }));
  } catch {
    // Storage blocked: the best score just isn't kept.
  }
  return { best, isNew: true };
}
