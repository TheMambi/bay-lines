import { useEffect, useMemo, useRef } from 'react';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { useClockMinute, useClockPlaying, useClockSpeed } from '../hooks/useReplayClock';
import { plural } from '../lib/format';
import {
  SERVICE_END_MINUTE,
  SPEEDS,
  activityCurve,
  countByLine,
  scheduledTrains,
  trainPosition,
  trainsAt,
} from '../lib/replay';
import { DAY_LABELS, formatMinute } from '../lib/time';

const JUMP_TIMES = [
  { label: 'First trains', at: 300 },
  { label: 'Morning', at: 480 },
  { label: 'Afternoon', at: 1020 },
  { label: 'Late night', at: 1380 },
];

const REPLAY_DAYS = ['weekday', 'saturday', 'sunday'];

const SCRUB_SIZE = { w: 300, h: 46 };

const SCRUB_TICK_HOURS = [5, 9, 13, 17, 21, 25];

export function ReplayPanel({
  net,
  clock,
  day,
  onDay,
  followId,
  onFollow,
  lineFilter,
  onLineFilter,
  nowMinute,
  todayDay,
}) {
  const minute = useClockMinute(clock);
  const playing = useClockPlaying(clock);
  const speed = useClockSpeed(clock);
  const nameOf = (id) => net.stationById.get(id)?.name ?? id;
  const trains = useMemo(() => scheduledTrains(net, day), [net, day]);
  const curve = useMemo(() => activityCurve(trains, 10), [trains]);
  const peak = useMemo(
    () =>
      curve.reduce((acc, item) => {
        if (item.count > acc.count) {
          return item;
        }
        return acc;
      }, curve[0]),
    [curve],
  );
  const positions = trainsAt(net, trains, minute);
  const lineCounts = countByLine(positions);
  const sorted = [...positions].sort(
    (a, b) => a.train.lineId.localeCompare(b.train.lineId) || a.train.start - b.train.start,
  );
  const followed = followId ? trains.find((train) => train.id === followId) : undefined;
  const followedPos = followed ? trainPosition(net, followed, minute) : null;
  const followedPattern = followed ? net.patternById.get(followed.patternId) : undefined;
  const nextStop = (() => {
    if (!followed || !followedPos || !followedPattern) {
      return null;
    }
    const nextIndex = followedPos.index + 1;
    if (nextIndex >= followedPattern.stations.length) {
      return null;
    }
    return { id: followedPattern.stations[nextIndex], at: followed.start + followedPattern.arr[nextIndex] };
  })();
  const scrubX = (m) => ((m - 240) / (SERVICE_END_MINUTE - 240)) * SCRUB_SIZE.w;
  const scrubY = (count) => SCRUB_SIZE.h - (count / Math.max(1, peak.count)) * (SCRUB_SIZE.h - 4);
  const areaPath =
    `M${scrubX(curve[0].t)} ${SCRUB_SIZE.h} ` +
    curve.map((point) => `L${scrubX(point.t).toFixed(1)} ${scrubY(point.count).toFixed(1)}`).join(' ') +
    ` L${scrubX(curve[curve.length - 1].t)} ${SCRUB_SIZE.h} Z`;
  const countNow = curve.find((point) => point.t === Math.round(minute / 10) * 10)?.count ?? positions.length;
  const listed = lineFilter ? sorted.filter((position) => position.train.lineId === lineFilter) : sorted;
  const filterName = lineFilter ? net.lineById.get(lineFilter)?.name : undefined;
  const trainHeadingRef = useRef(null);
  const focusHeadingRef = useRef(false);
  useEffect(() => {
    if (followId && focusHeadingRef.current) {
      trainHeadingRef.current?.focus({ preventScroll: true });
    }
    focusHeadingRef.current = false;
  }, [followId]);
  const whereText = (position) => {
    if (position.from === position.to || position.dwelling) {
      return `at ${nameOf(position.from)}`;
    }
    return `between ${nameOf(position.from)} and ${nameOf(position.to)}`;
  };
  return (
    <section aria-labelledby="replay-title" className="lens">
      <h2 id="replay-title" className="card-title card-title-sm">
        Timetable replay
      </h2>
      <p className="notice notice-warn" role="note">
        <Icon name="alert" size={18} />
        <span>
          <strong>Not live.</strong>
          {
            ' These trains are placed from BART’s published schedule, not tracked. Real trains run early, late, or not at all.'
          }
        </span>
      </p>
      {followed && followedPattern && (
        <div className="train-card" role="region" aria-label="Highlighted train">
          <h3 className="card-title card-title-sm" ref={trainHeadingRef} tabIndex={-1}>
            {net.lineById.get(followed.lineId).name}
            {' line toward '}
            {nameOf(followedPattern.stations[followedPattern.stations.length - 1])}
          </h3>
          <p className="train-where">
            {followedPos
              ? `The timetable puts this train ${followedPos.dwelling ? `at ${nameOf(followedPos.from)}` : `between ${nameOf(followedPos.from)} and ${nameOf(followedPos.to)}`}.`
              : `This train isn’t running at ${formatMinute(minute)}: it runs ${formatMinute(followed.first)} to ${formatMinute(followed.last)}.`}
            {nextStop && (
              <>
                {' Next stop: '}
                {nameOf(nextStop.id)}
                {', scheduled '}
                {formatMinute(nextStop.at)}.
              </>
            )}
          </p>
          <details className="reach-more">
            <summary>All stops and scheduled times</summary>
            <p className="fine">Typical times for this route; a given trip can differ by a minute or two.</p>
            <ol className="stop-times">
              {followedPattern.stations.map((station, index) => {
                const at =
                  followed.start + (index === 0 ? followedPattern.dep[0] : followedPattern.arr[index]);
                return (
                  <li key={`${station}-${index}`} className={at < minute ? 'is-passed' : undefined}>
                    <span className="st-time">{formatMinute(at)}</span>
                    <span>{nameOf(station)}</span>
                  </li>
                );
              })}
            </ol>
          </details>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFollow(null)}>
            Stop highlighting
          </button>
        </div>
      )}
      <div className="seg" role="group" aria-label="Which day’s timetable">
        {REPLAY_DAYS.map((d) => (
          <button key={d} type="button" aria-pressed={day === d} onClick={() => onDay(d)}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>
      <div className="clock-readout">
        <span className="clock-time">{formatMinute(minute)}</span>
        <span className="clock-sub">
          {'scheduled · '}
          {plural(positions.length, 'train')}
          {' running'}
          {filterName ? `, showing ${listed.length} ${filterName}` : ''}
        </span>
      </div>
      <div className="btn-row btn-row-tight">
        <button type="button" className="btn btn-primary" onClick={() => clock.toggle()}>
          <Icon name={playing ? 'pause' : 'play'} size={18} /> {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => clock.set(minute - 15)}>
          <Icon name="left" size={16} />
          {' 15 min'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => clock.set(minute + 15)}>
          {'15 min '}
          <Icon name="right" size={16} />
        </button>
      </div>
      <div className="scrub">
        <svg
          viewBox={`0 0 ${SCRUB_SIZE.w} ${SCRUB_SIZE.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={areaPath} className="scrub-area" />
          <line x1={scrubX(minute)} x2={scrubX(minute)} y1={0} y2={SCRUB_SIZE.h} className="scrub-cursor" />
        </svg>
        <input
          type="range"
          aria-label="Time of day"
          min={240}
          max={SERVICE_END_MINUTE}
          step={1}
          value={minute}
          aria-valuetext={`${formatMinute(minute)}, about ${countNow} trains running`}
          onChange={(event) => clock.set(Number(event.target.value))}
        />
        <div className="scrub-ticks" aria-hidden="true">
          {SCRUB_TICK_HOURS.map((tick) => (
            <span
              key={tick}
              style={{
                left: `calc(12px + (100% - 24px) * ${(tick * 60 - 240) / (SERVICE_END_MINUTE - 240)})`,
              }}
            >
              {formatMinute(tick * 60).replace(':00 ', ' ')}
            </span>
          ))}
        </div>
      </div>
      <p className="fine">
        {'The shaded shape is how many trains are in service through the '}
        {DAY_LABELS[day].toLowerCase()}
        {' timetable. Busiest: about '}
        {peak.count}
        {' at '}
        {formatMinute(peak.t)}.
      </p>
      <div className="lens-field">
        <span className="field-label" id="speed-label">
          Speed
        </span>
        <div className="seg" role="group" aria-labelledby="speed-label">
          {SPEEDS.map((speedOption) => (
            <button
              key={speedOption.perSecond}
              type="button"
              aria-pressed={speed === speedOption.perSecond}
              onClick={() => clock.setSpeed(speedOption.perSecond)}
            >
              {speedOption.label}
            </button>
          ))}
        </div>
      </div>
      <div className="lens-field">
        <span className="field-label" id="jump-label">
          Jump to
        </span>
        <div className="try-row" role="group" aria-labelledby="jump-label">
          {JUMP_TIMES.map((jump) => (
            <button key={jump.label} type="button" className="tag tag-btn" onClick={() => clock.set(jump.at)}>
              {jump.label}
            </button>
          ))}
          <button
            type="button"
            className="tag tag-btn"
            disabled={day !== todayDay}
            onClick={() => clock.set(nowMinute)}
            title={
              day === todayDay
                ? 'The point in today’s timetable that matches the clock now. Not live.'
                : 'Today follows a different timetable'
            }
          >
            Scheduled now
          </button>
        </div>
      </div>
      <h3 className="card-h" id="line-filter-label">
        Trains in service, by line
      </h3>
      <ul className="line-counts" aria-labelledby="line-filter-label">
        {net.lines.map((line) => {
          const count = lineCounts.get(line.id) ?? 0;
          return (
            <li key={line.id}>
              <button
                type="button"
                className="line-count-btn"
                aria-pressed={lineFilter === line.id}
                aria-label={`${line.name} line: ${plural(count, 'train')} in service. ${lineFilter === line.id ? 'Showing only this line. Press to show all lines.' : 'Press to show only this line.'}`}
                onClick={() => onLineFilter(lineFilter === line.id ? null : line.id)}
              >
                <LineChip line={line} size="sm" muted={!count} />
                <span className="count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fine">
        {lineFilter
          ? `Showing only the ${net.lineById.get(lineFilter)?.name} line on the map.`
          : 'Press a line to show only its trains on the map.'}
      </p>
      <details className="reach-more">
        <summary>
          Pick a train ({listed.length} {filterName ? `${filterName} ` : ''}
          in service)
        </summary>
        {listed.length ? (
          <ul className="train-list">
            {listed.map((position) => (
              <li key={position.train.id}>
                <button
                  type="button"
                  className="line-row"
                  aria-pressed={followId === position.train.id}
                  onClick={() => {
                    focusHeadingRef.current = followId !== position.train.id;
                    onFollow(followId === position.train.id ? null : position.train.id);
                  }}
                >
                  <LineChip line={net.lineById.get(position.train.lineId)} size="sm" />
                  <span className="line-meta">
                    <span className="line-ends">
                      {'toward '}
                      {nameOf(position.toward)}
                    </span>
                    <span className="line-status">{whereText(position)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            {filterName
              ? `No ${filterName} line trains are scheduled at this time.`
              : 'No trains are scheduled at this time.'}
            {' Try a different time of day.'}
          </p>
        )}
      </details>
      <p className="fine">You can also click a train on the map to highlight it.</p>
      <p className="fine lens-note">
        Positions come from each trip’s scheduled departure and the typical time between stops for that route.
        Every trip in the timetable in effect for this kind of day is drawn, including short and
        first-and-last-of-the-day trips. Special-event schedules and one-off changes on particular dates
        aren’t modelled. Trains are drawn as small symbols and are not to scale.
      </p>
    </section>
  );
}
