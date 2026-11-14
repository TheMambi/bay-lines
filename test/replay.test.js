import { describe, expect, it } from 'vitest';
import { DAYS, net } from '../src/lib/network';
import {
  ReplayClock,
  SERVICE_END_MINUTE,
  activityCurve,
  countByLine,
  scheduledTrains,
  trainPosition,
  trainsAt,
} from '../src/lib/replay';

const trainsByDay = new Map(DAYS.map((day) => [day, scheduledTrains(net, day)]));
const weekday = trainsByDay.get('weekday');

describe('scheduledTrains', () => {
  it.each(DAYS)('lists every departure of the %s timetable once, in order of departure', (day) => {
    const trains = trainsByDay.get(day);
    const departures = net.patterns.reduce((sum, pattern) => sum + (pattern.departures[day]?.length ?? 0), 0);
    expect(trains).toHaveLength(departures);
    expect(new Set(trains.map((train) => train.id)).size).toBe(trains.length);
    for (let i = 1; i < trains.length; i++) {
      expect(trains[i].start).toBeGreaterThanOrEqual(trains[i - 1].start);
    }
    for (const train of trains) {
      expect(train.last, train.id).toBeGreaterThan(train.first);
      expect(train.last, train.id).toBeLessThanOrEqual(SERVICE_END_MINUTE);
    }
  });
});

describe('trainPosition', () => {
  it('is nowhere before the first stop and after the last', () => {
    for (const train of weekday) {
      expect(trainPosition(net, train, train.first - 1), train.id).toBeNull();
      expect(trainPosition(net, train, train.last + 1), train.id).toBeNull();
    }
  });

  it('starts waiting at the first station and ends waiting at the last', () => {
    for (const train of weekday) {
      const pattern = net.patternById.get(train.patternId);
      const lastStop = pattern.stations[pattern.stations.length - 1];
      expect(trainPosition(net, train, train.first), train.id).toMatchObject({
        index: 0,
        from: pattern.stations[0],
        dwelling: true,
        toward: lastStop,
      });
      expect(trainPosition(net, train, train.last), train.id).toMatchObject({
        index: pattern.stations.length - 1,
        from: lastStop,
        dwelling: true,
      });
    }
  });

  it('moves every train forward along its own stops, minute by minute and in between', () => {
    // Plain checks and one expect at the end: this visits about 400,000 moments.
    const problems = [];
    for (const day of DAYS) {
      for (const train of trainsByDay.get(day)) {
        const { stations } = net.patternById.get(train.patternId);
        const lastIndex = stations.length - 1;
        let progress = -1;
        for (let minute = train.first; minute <= train.last; minute += 0.5) {
          const at = trainPosition(net, train, minute);
          const ok =
            at &&
            at.from === stations[at.index] &&
            at.to === stations[Math.min(at.index + 1, lastIndex)] &&
            at.frac >= 0 &&
            at.frac <= 1 &&
            (!at.dwelling || at.frac === 0) &&
            at.index + at.frac >= progress;
          if (!ok) {
            problems.push(`${day} ${train.id} at minute ${minute}`);
            break;
          }
          progress = at.index + at.frac;
        }
        if (progress !== lastIndex) {
          problems.push(`${day} ${train.id} never reaches its last stop`);
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('places a train halfway between two stops halfway through the ride, counted from when it leaves', () => {
    // A stop where the train waits before leaving, so arriving and leaving are different minutes.
    let found;
    for (const train of weekday) {
      const pattern = net.patternById.get(train.patternId);
      const stop = pattern.dep.findIndex(
        (leaves, index) => leaves > pattern.arr[index] && pattern.arr[index + 1] - leaves >= 2,
      );
      if (stop >= 0) {
        found = { train, pattern, stop };
        break;
      }
    }
    const { train, pattern, stop } = found;
    const midway = train.start + (pattern.dep[stop] + pattern.arr[stop + 1]) / 2;
    expect(trainPosition(net, train, midway)).toMatchObject({
      index: stop,
      from: pattern.stations[stop],
      to: pattern.stations[stop + 1],
      frac: 0.5,
      dwelling: false,
    });
  });

  it('ignores a train whose stopping pattern is not in the data', () => {
    expect(trainPosition(net, { ...weekday[0], patternId: 'gone' }, weekday[0].first)).toBeNull();
  });
});

describe('trainsAt', () => {
  it.each(DAYS)('finds the same trains as checking every %s train one by one', (day) => {
    const trains = trainsByDay.get(day);
    for (let minute = 240; minute <= SERVICE_END_MINUTE; minute += 7) {
      const expected = trains.filter((train) => trainPosition(net, train, minute)).map((train) => train.id);
      expect(
        trainsAt(net, trains, minute).map((at) => at.train.id),
        `${day} minute ${minute}`,
      ).toEqual(expected);
    }
  });

  it('shows no trains at 4 am and a full railway at 8 am on a weekday', () => {
    expect(trainsAt(net, weekday, 240)).toEqual([]);
    expect(trainsAt(net, weekday, 480).length).toBeGreaterThan(30);
  });
});

describe('counts for the replay panel', () => {
  it('counts the trains on each line', () => {
    const running = trainsAt(net, weekday, 480);
    const counts = countByLine(running);
    expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(running.length);
    for (const [lineId, count] of counts) {
      expect(net.lineById.has(lineId), lineId).toBe(true);
      expect(count).toBe(running.filter((at) => at.train.lineId === lineId).length);
    }
  });

  it('draws the activity curve from the same trains the map shows', () => {
    const curve = activityCurve(weekday);
    expect(curve[0].t).toBe(240);
    expect(curve[curve.length - 1].t).toBe(SERVICE_END_MINUTE);
    for (const point of curve) {
      expect(point.count, `minute ${point.t}`).toBe(trainsAt(net, weekday, point.t).length);
    }
  });
});

describe('ReplayClock', () => {
  // The clock asks the browser for the next frame; here each frame is handed over by the test.
  const withFrames = (run) => {
    const real = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
    const cancelled = [];
    globalThis.requestAnimationFrame = () => 7;
    globalThis.cancelAnimationFrame = (id) => cancelled.push(id);
    try {
      run(cancelled);
    } finally {
      [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = real;
    }
  };

  it('keeps the time of day inside the service day', () => {
    expect(new ReplayClock(100).minute).toBe(240);
    expect(new ReplayClock(2000).minute).toBe(SERVICE_END_MINUTE);
    const clock = new ReplayClock(600);
    clock.set(-5);
    expect(clock.minute).toBe(240);
    clock.set(99999);
    expect(clock.minute).toBe(SERVICE_END_MINUTE);
  });

  it('advances by the chosen number of timetable minutes per second', () =>
    withFrames(() => {
      const clock = new ReplayClock(600);
      clock.play();
      clock.loop(1000);
      expect(clock.minute).toBe(600);
      clock.loop(1100);
      expect(clock.minute).toBeCloseTo(600.1);
      clock.setSpeed(10);
      clock.loop(1200);
      expect(clock.minute).toBeCloseTo(601.1);
    }));

  it('does not leap ahead after the tab was in the background', () =>
    withFrames(() => {
      const clock = new ReplayClock(600);
      clock.setSpeed(10);
      clock.play();
      clock.loop(1000);
      clock.loop(61000);
      expect(clock.minute).toBeCloseTo(602.5);
    }));

  it('wraps from the end of the service day to 4 am and keeps going', () =>
    withFrames(() => {
      const clock = new ReplayClock(SERVICE_END_MINUTE - 0.5);
      clock.setSpeed(10);
      clock.play();
      clock.loop(1000);
      clock.loop(1100);
      expect(clock.minute).toBeCloseTo(240.5);
      expect(clock.playing).toBe(true);
    }));

  it('moves in whole steps once a second when motion is reduced', () =>
    withFrames(() => {
      const clock = new ReplayClock(600, true);
      clock.setSpeed(3);
      clock.play();
      let now = 1000;
      clock.loop(now);
      for (let frame = 0; frame < 3; frame++) {
        clock.loop((now += 250));
        expect(clock.minute).toBe(600);
      }
      clock.loop(now + 250);
      expect(clock.minute).toBe(603);
    }));

  it('stands still while paused and tells listeners about every change', () =>
    withFrames((cancelled) => {
      const clock = new ReplayClock(600);
      let calls = 0;
      const stop = clock.subscribe(() => calls++);
      clock.toggle();
      expect(clock.playing).toBe(true);
      clock.toggle();
      expect(clock.playing).toBe(false);
      expect(cancelled).toEqual([7]);
      clock.loop(1000);
      clock.loop(2000);
      expect(clock.minute).toBe(600);
      expect(calls).toBe(2);
      clock.pause();
      expect(calls).toBe(2);
      stop();
      clock.set(700);
      expect(calls).toBe(2);
    }));
});
