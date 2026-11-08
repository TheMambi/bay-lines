import { ExternalLink } from './ExternalLink';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { ALERT_EFFECTS, tagAlerts } from '../lib/alerts';
import { formatDateTime, formatTime, plural, safeBartUrl, timeAgo } from '../lib/format';

export function AlertsPanel({ net, state, onRefresh, onStation }) {
  const shown =
    state.kind === 'ready'
      ? { payload: state.data, receivedAt: state.receivedAt }
      : state.kind === 'error' && state.lastGood
        ? { payload: state.lastGood.data, receivedAt: state.lastGood.receivedAt }
        : undefined;
  return (
    <div className="alerts">
      {state.kind === 'loading' && (
        <p className="notice notice-info" role="status">
          <Icon name="clock" size={18} />
          <span>Loading BART’s service alerts…</span>
        </p>
      )}
      {state.kind === 'error' && (
        <div className="notice notice-warn" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <p>
              <strong>
                {shown ? 'Couldn’t refresh service alerts.' : 'Service alerts aren’t available right now.'}
              </strong>{' '}
              {state.message}
            </p>
            <p>
              The map and route suggestions still work, but they don’t know about delays or closures. Check
              the official advisories before you travel.
            </p>
          </div>
        </div>
      )}
      {shown?.payload.stale && (
        <p className="notice notice-warn" role="status">
          <Icon name="alert" size={18} />
          <span>
            BART’s feed couldn’t be reached just now, so this is the last copy we received. It may be out of
            date.
          </span>
        </p>
      )}
      {shown && (
        <>
          <p className="fine alerts-time">
            {'Feed time: '}
            {shown.payload.feedTimestamp ? formatDateTime(shown.payload.feedTimestamp) : 'not provided'}
            {' · checked '}
            {formatTime(shown.receivedAt)}
            {' ('}
            {timeAgo(shown.receivedAt)}
            ).
          </p>
          {shown.payload.alerts.length === 0 ? (
            <p className="empty">
              BART’s alerts feed lists no active service alerts right now. That is what the feed says; it
              isn’t a guarantee that trains are running normally.
            </p>
          ) : (
            <>
              <p className="sr-only" role="status">
                {plural(shown.payload.alerts.length, 'alert')}
              </p>
              <ul className="alert-list">
                {tagAlerts(net, shown.payload.alerts).map(({ alert, lineIds, stationIds, tagged }) => (
                  <li key={alert.id} className="alert-item">
                    {alert.headline && <h3>{alert.headline}</h3>}
                    <p>{alert.description}</p>
                    <div className="alert-meta">
                      {alert.effect && ALERT_EFFECTS[alert.effect] && (
                        <span className="tag">{ALERT_EFFECTS[alert.effect]}</span>
                      )}
                      {lineIds.map((lineId) => (
                        <LineChip key={lineId} line={net.lineById.get(lineId)} size="sm" />
                      ))}
                      {stationIds.map((stationId) => (
                        <button
                          key={stationId}
                          type="button"
                          className="tag tag-btn"
                          onClick={() => onStation(stationId)}
                        >
                          {net.stationById.get(stationId).name}
                        </button>
                      ))}
                    </div>
                    {!tagged && (
                      <p className="fine">
                        The feed doesn’t tag this alert to particular lines or stations; read the text for
                        where it applies.
                      </p>
                    )}
                    {alert.activePeriods.some((period) => period.start || period.end) && (
                      <p className="fine">
                        Active:{' '}
                        {alert.activePeriods
                          .filter((period) => period.start || period.end)
                          .map(
                            (period) =>
                              `${period.start ? formatDateTime(period.start) : 'now'} – ${period.end ? formatDateTime(period.end) : 'until further notice'}`,
                          )
                          .join('; ')}
                      </p>
                    )}
                    {safeBartUrl(alert.url) && (
                      <p className="fine">
                        <ExternalLink href={safeBartUrl(alert.url)}>More on bart.gov</ExternalLink>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <div className="btn-row btn-row-tight">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
          <Icon name="refresh" size={16} />
          {' Refresh'}
        </button>
        <a
          className="btn btn-secondary btn-sm"
          href="https://www.bart.gov/schedules/advisories"
          target="_blank"
          rel="noopener noreferrer"
        >
          {'Official advisories '}
          <Icon name="external" size={14} /> <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      <p className="fine">
        Source: BART’s GTFS-Realtime service-alerts feed, fetched by this app’s server and refreshed about
        every 90 seconds while the page is open. This app does not show live train arrivals.
      </p>
    </div>
  );
}
