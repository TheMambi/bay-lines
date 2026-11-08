export const SERVICE_END_MINUTE = 1560;

export function scheduledTrains(net, day) {
  const trains = [];
  for (const pattern of net.patterns) {
    const starts = pattern.departures[day];
    if (!starts) {
      continue;
    }
    const lastStop = pattern.stations.length - 1;
    for (const start of starts) {
      trains.push({
        id: `${pattern.id}@${start}`,
        lineId: pattern.lineId,
        patternId: pattern.id,
        start,
        first: start + pattern.arr[0],
        last: start + pattern.arr[lastStop],
      });
    }
  }
  trains.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return trains;
}

export function trainPosition(net, train, minute) {
  if (minute < train.first || minute > train.last) {
    return null;
  }
  const pattern = net.patternById.get(train.patternId);
  if (!pattern) {
    return null;
  }
  const elapsed = minute - train.start;
  const length = pattern.stations.length;
  const toward = pattern.stations[length - 1];
  for (let stop = 0; stop < length; stop++) {
    if (elapsed <= pattern.dep[stop]) {
      return {
        train,
        pattern,
        index: stop,
        from: pattern.stations[stop],
        to: pattern.stations[Math.min(stop + 1, length - 1)],
        frac: 0,
        dwelling: true,
        toward,
      };
    }
    if (stop < length - 1 && elapsed < pattern.arr[stop + 1]) {
      const hop = pattern.arr[stop + 1] - pattern.dep[stop];
      const progress = hop > 0 ? (elapsed - pattern.dep[stop]) / hop : 1;
      return {
        train,
        pattern,
        index: stop,
        from: pattern.stations[stop],
        to: pattern.stations[stop + 1],
        frac: Math.min(1, Math.max(0, progress)),
        dwelling: false,
        toward,
      };
    }
    if (stop < length - 1 && elapsed <= pattern.dep[stop + 1] && elapsed >= pattern.arr[stop + 1]) {
      return {
        train,
        pattern,
        index: stop + 1,
        from: pattern.stations[stop + 1],
        to: pattern.stations[Math.min(stop + 2, length - 1)],
        frac: 0,
        dwelling: true,
        toward,
      };
    }
  }
  const last = length - 1;
  return {
    train,
    pattern,
    index: last,
    from: pattern.stations[last],
    to: pattern.stations[last],
    frac: 0,
    dwelling: true,
    toward,
  };
}

export function trainsAt(net, trains, minute) {
  const positions = [];
  for (const train of trains) {
    if (train.start - 12 > minute) {
      break;
    }
    const position = trainPosition(net, train, minute);
    if (position) {
      positions.push(position);
    }
  }
  return positions;
}

export function countByLine(positions) {
  const counts = new Map();
  for (const position of positions) {
    counts.set(position.train.lineId, (counts.get(position.train.lineId) ?? 0) + 1);
  }
  return counts;
}

export function activityCurve(trains, step = 5, from = 240, to = SERVICE_END_MINUTE) {
  const points = [];
  for (let minute = from; minute <= to; minute += step) {
    let count = 0;
    for (const train of trains) {
      if (train.start - 12 > minute) {
        break;
      }
      if (minute >= train.first && minute <= train.last) {
        count++;
      }
    }
    points.push({ t: minute, count });
  }
  return points;
}

export const SPEEDS = [
  { perSecond: 1, label: '1 min/s' },
  { perSecond: 3, label: '3 min/s' },
  { perSecond: 10, label: '10 min/s' },
];

export class ReplayClock {
  minute;
  playing = false;
  perSecond = 1;
  stepped;
  listeners = new Set();
  raf = 0;
  last = 0;
  acc = 0;
  constructor(minute, stepped = false) {
    this.minute = Math.min(SERVICE_END_MINUTE, Math.max(240, minute));
    this.stepped = stepped;
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  emit() {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
  set(minute) {
    this.minute = Math.min(SERVICE_END_MINUTE, Math.max(240, minute));
    this.emit();
  }
  setSpeed(perSecond) {
    this.perSecond = perSecond;
    this.emit();
  }
  play() {
    if (!this.playing) {
      this.playing = true;
      this.last = 0;
      this.acc = 0;
      this.raf = requestAnimationFrame(this.loop);
      this.emit();
    }
  }
  pause() {
    if (this.playing) {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.emit();
    }
  }
  toggle() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }
  destroy() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  }
  loop = (now) => {
    if (!this.playing) {
      return;
    }
    const dt = this.last ? Math.min(250, now - this.last) : 0;
    this.last = now;
    let advance = 0;
    if (this.stepped) {
      this.acc += dt;
      if (this.acc >= 1000) {
        const steps = Math.floor(this.acc / 1000);
        this.acc -= steps * 1000;
        advance = steps * this.perSecond;
      }
    } else {
      advance = (dt / 1000) * this.perSecond;
    }
    if (advance > 0) {
      let next = this.minute + advance;
      if (next > 1560) {
        next = 240 + (next - SERVICE_END_MINUTE);
      }
      this.minute = next;
      this.emit();
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
