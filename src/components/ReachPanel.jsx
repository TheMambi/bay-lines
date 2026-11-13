import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { RangeField } from './RangeField';
import { ServicePicker } from './ServicePicker';
import { StationSearch } from './StationSearch';
import { plural } from '../lib/format';
import { reachBand, summarizeReach } from '../lib/reach';

const REACH_SUGGESTIONS = ['EMBR', '12TH', 'DBRK', 'DUBL', 'SFIA'];

const MEET_SHOWN = 6;

function bandRanges(horizon) {
  const ranges = [];
  for (let minute = 0; minute <= horizon; minute++) {
    const band = reachBand(minute, horizon);
    if (band == null) {
      continue;
    }
    const last = ranges[ranges.length - 1];
    if (last && last.band === band) {
      last.hi = minute;
    } else {
      ranges.push({ band, lo: minute, hi: minute });
    }
  }
  return ranges;
}

export function ReachPanel({
  net,
  service,
  nowService,
  usingNow,
  onService,
  origin,
  onOrigin,
  origin2,
  onOrigin2,
  picking2,
  onPick2,
  meeting,
  horizon,
  onHorizon,
  allowance,
  onAllowance,
  firstWait,
  onFirstWait,
  reach,
  searchRef,
  onExpand,
  onPlan,
}) {
  const nameOf = (id) => net.stationById.get(id)?.name ?? id;
  const [twoPeople, setTwoPeople] = useState(origin2 != null);
  const showB = twoPeople || origin2 != null;
  const summary = useMemo(() => {
    if (origin && reach) {
      return summarizeReach(reach, origin, horizon, net.stations.length);
    }
    return null;
  }, [origin, reach, horizon, net]);
  const lists = useMemo(() => {
    if (!origin || !reach) {
      return { within: [], beyond: [] };
    }
    const entries = [...reach]
      .filter(([id]) => id !== origin)
      .sort((a, b) => a[1].minutes - b[1].minutes || nameOf(a[0]).localeCompare(nameOf(b[0])));
    return {
      within: entries.filter(([, entry]) => entry.minutes <= horizon),
      beyond: entries.filter(([, entry]) => entry.minutes > horizon),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf only reads net, which never changes.
  }, [origin, reach, horizon]);
  const legend = useMemo(() => bandRanges(horizon), [horizon]);
  const meetingWithin = useMemo(
    () => (meeting ?? []).filter((point) => point.minutes <= horizon),
    [meeting, horizon],
  );
  const renderReachRow = ([stationId, entry]) => {
    const lineIds = [...new Set(entry.lineIds)];
    return (
      <li key={stationId} className="reach-row" data-band={reachBand(entry.minutes, horizon) ?? 'far'}>
        <span className="reach-swatch" aria-hidden="true" />
        <span className="reach-main">
          <span className="reach-name">{nameOf(stationId)}</span>
          <span className="reach-sub">
            {entry.transfers === 0 ? 'Direct' : plural(entry.transfers, 'transfer')}
            <span className="reach-chips">
              {lineIds.map((lineId) => (
                <LineChip key={lineId} line={net.lineById.get(lineId)} size="sm" />
              ))}
            </span>
          </span>
        </span>
        <span className="reach-min">
          <strong>{entry.minutes}</strong>
          {' min'}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label={`Plan trip from ${nameOf(origin)} to ${nameOf(stationId)}`}
          onClick={() => onPlan(origin, stationId)}
        >
          Plan trip
        </button>
      </li>
    );
  };
  const renderMeetRow = (point) => (
    <li
      key={point.id}
      className="reach-row reach-row-meet"
      data-band={reachBand(point.minutes, horizon) ?? 'far'}
    >
      <span className="reach-swatch" aria-hidden="true" />
      <span className="reach-main">
        <span className="reach-name">{nameOf(point.id)}</span>
        <span className="reach-sub">
          <span>
            <span className="pin-dot pin-dot-sm" aria-hidden="true">
              A
            </span>{' '}
            <span className="sr-only">
              {'From '}
              {nameOf(origin)}
              {': '}
            </span>
            {point.a.minutes}
            {' min'}
          </span>
          <span>
            <span className="pin-dot pin-dot-b pin-dot-sm" aria-hidden="true">
              B
            </span>{' '}
            <span className="sr-only">
              {'From '}
              {nameOf(origin2)}
              {': '}
            </span>
            {point.b.minutes}
            {' min'}
          </span>
        </span>
      </span>
      <span className="reach-min">
        <strong>{point.minutes}</strong>
        {' min'}
      </span>
      <span className="reach-plans">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label={`Plan trip from ${nameOf(origin)} to ${nameOf(point.id)}`}
          onClick={() => onPlan(origin, point.id)}
        >
          A’s trip
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label={`Plan trip from ${nameOf(origin2)} to ${nameOf(point.id)}`}
          onClick={() => onPlan(origin2, point.id)}
        >
          B’s trip
        </button>
      </span>
    </li>
  );
  const sameStart = !!origin && !!origin2 && origin === origin2;
  const meetMode = !!origin && !!origin2 && !sameStart && !!meeting;
  const fairest = meetMode ? meetingWithin[0] : undefined;
  return (
    <section aria-labelledby="reach-title" className="lens">
      <h2 id="reach-title" className="card-title card-title-sm">
        How far can I get?
      </h2>
      {!origin && (
        <p className="fine">
          Choose a station and a time. The map lights up everything scheduled BART service can reach in that
          time, and fades the rest. You can also tap any station on the map.
        </p>
      )}
      <div className="lens-field">
        <StationSearch
          net={net}
          label={showB ? 'Person A starts from' : 'Starting from'}
          placeholder="Search for a station"
          value={origin}
          inputRef={searchRef}
          onFocusInput={onExpand}
          leading={
            showB ? (
              <span className="pin-dot" aria-hidden="true">
                A
              </span>
            ) : undefined
          }
          onSelect={onOrigin}
          onClear={() => onOrigin(null)}
        />
        {!origin && (
          <p className="try-row">
            <span className="fine">Try:</span>
            {REACH_SUGGESTIONS.filter((id) => net.stationById.has(id)).map((id) => (
              <button key={id} type="button" className="tag tag-btn" onClick={() => onOrigin(id)}>
                {nameOf(id)}
              </button>
            ))}
          </p>
        )}
      </div>
      {origin && !showB && (
        <p className="try-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTwoPeople(true)}>
            <Icon name="swap" size={16} />
            {' Meet someone in the middle'}
          </button>
        </p>
      )}
      {origin && showB && (
        <div className="lens-field">
          <StationSearch
            net={net}
            label="Person B starts from"
            placeholder="Search for a station"
            value={origin2}
            onFocusInput={onExpand}
            leading={
              <span className="pin-dot pin-dot-b" aria-hidden="true">
                B
              </span>
            }
            trailing={
              <button
                type="button"
                className={`icon-btn icon-btn-outline${picking2 ? ' is-on' : ''}`}
                aria-pressed={picking2}
                aria-label="Choose Person B’s station on the map"
                title="Choose on the map"
                onClick={onPick2}
              >
                <Icon name="target" size={18} />
              </button>
            }
            onSelect={onOrigin2}
            onClear={() => onOrigin2(null)}
          />
          <p className="try-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onOrigin2(null);
                setTwoPeople(false);
              }}
            >
              Back to one person
            </button>
          </p>
        </div>
      )}
      {origin && reach && summary ? (
        <>
          {sameStart ? (
            <p className="reach-summary" role="status">
              Person B starts at the same station as Person A (<strong>{nameOf(origin)}</strong>
              ). Choose a different station for B to see where you could meet.
            </p>
          ) : meetMode ? (
            <p className="reach-summary" role="status">
              {fairest ? (
                <>
                  {'Fairest place to meet: '}
                  <strong>{nameOf(fairest.id)}</strong>
                  {'. The one who arrives last is there in '}
                  <strong>
                    {fairest.minutes}
                    {' min'}
                  </strong>
                  {' (from '}
                  {nameOf(origin)} {fairest.a.minutes}
                  {' min, from '}
                  {nameOf(origin2)} {fairest.b.minutes}
                  {' min).'}
                </>
              ) : (
                <>
                  {'No station is within '}
                  {horizon}
                  {' minutes of '}
                  <strong>both</strong> {nameOf(origin)}
                  {' and '}
                  {nameOf(origin2)}. Try a longer time.
                </>
              )}
            </p>
          ) : (
            <p className="reach-summary" role="status">
              <strong>
                {summary.within}
                {' of '}
                {summary.others}
              </strong>{' '}
              {'other stations are within '}
              {horizon}
              {' minutes of '}
              <strong>{nameOf(origin)}</strong>.
              {summary.farthest && (
                <>
                  {' '}
                  {'Farthest: '}
                  {nameOf(summary.farthest.id)}
                  {', '}
                  {summary.farthest.minutes}
                  {' min.'}
                </>
              )}
            </p>
          )}
          <p className="fine reach-caveat">
            Scheduled train time only
            {allowance ? `, plus ${allowance} min for each change` : ''}
            {'. '}
            {firstWait
              ? `Includes ${firstWait} min waiting for your first train.`
              : 'Assumes your first train is already there.'}
            {' Leaves out the walk to the station and delays.'}
          </p>
          <h3 className="sr-only">Colour key</h3>
          <ul className="reach-legend" aria-label="Colour key, minutes from the start">
            {legend.map((band) => (
              <li key={band.band} data-band={band.band}>
                <span className="reach-swatch" aria-hidden="true" />
                {band.lo === band.hi ? `${band.lo}` : `${band.lo}–${band.hi}`}
                {' min'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <RangeField
        label="Time to travel"
        valueText={`${horizon} minutes`}
        min={10}
        max={90}
        step={5}
        value={horizon}
        onChange={onHorizon}
        hint="Colours and the list show stations you could reach within this many minutes."
      />
      <RangeField
        label="Wait for your first train"
        valueText={firstWait === 0 ? 'none' : `${firstWait} minutes`}
        min={0}
        max={15}
        value={firstWait}
        onChange={onFirstWait}
        hint="Your assumption, not the schedule’s. “None” means a train is just arriving when you reach the platform."
      />
      <RangeField
        label="Time for each transfer"
        valueText={allowance === 0 ? 'none' : `${allowance} minutes`}
        min={0}
        max={15}
        value={allowance}
        onChange={onAllowance}
        hint="Also your assumption: BART’s schedule doesn’t say how long you’ll wait for a connecting train, so you choose."
      />
      <ServicePicker service={service} nowService={nowService} usingNow={usingNow} onService={onService} />
      {origin && reach && summary ? (
        meetMode ? (
          <>
            <h3 className="card-h">
              {'Places to meet within '}
              {horizon}
              {' minutes'}
            </h3>
            <p className="fine">
              Ranked by who arrives last, so nobody waits longer than they need to. Ties go to the smaller
              total travel time. The top one is starred on the map.
            </p>
            {meetingWithin.length ? (
              <>
                <ul className="reach-list">{meetingWithin.slice(0, MEET_SHOWN).map(renderMeetRow)}</ul>
                {meetingWithin.length > MEET_SHOWN && (
                  <details className="reach-more">
                    <summary>More places ({meetingWithin.length - MEET_SHOWN})</summary>
                    <ul className="reach-list">{meetingWithin.slice(MEET_SHOWN).map(renderMeetRow)}</ul>
                  </details>
                )}
              </>
            ) : (
              <p className="empty">Nothing is reachable by both of you in that time. Try a longer time.</p>
            )}
          </>
        ) : (
          <>
            <h3 className="card-h">
              {'Within '}
              {horizon}
              {' minutes'}
            </h3>
            {lists.within.length ? (
              <ul className="reach-list">{lists.within.map(renderReachRow)}</ul>
            ) : (
              <p className="empty">Nothing else is reachable in that time. Try a longer time.</p>
            )}
            {lists.beyond.length > 0 && (
              <details className="reach-more">
                <summary>Farther stations ({lists.beyond.length})</summary>
                <ul className="reach-list">{lists.beyond.map(renderReachRow)}</ul>
              </details>
            )}
          </>
        )
      ) : (
        <p className="hint" role="note">
          <Icon name="target" size={18} />
          <span>Nothing chosen yet. Pick a station above, or tap one on the map.</span>
        </p>
      )}
      <p className="fine lens-note">
        The map is a diagram, not to scale: colours and numbers show time, not distance. Times come from
        BART’s published schedule, so real trips can take longer.
      </p>
    </section>
  );
}
