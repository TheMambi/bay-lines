import { ExternalLink } from './ExternalLink';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { describeService } from '../lib/time';
import { TRACK_FEATURES } from '../map/schematic';

export function StationCard({
  net,
  stationId,
  service,
  from,
  to,
  alerts,
  onStart,
  onGo,
  onClose,
  onOpenAlerts,
  backLabel,
}) {
  const station = net.stationById.get(stationId);
  const lineIds = net.linesAt(stationId);
  const runningLines = new Set(
    net
      .activePatterns(service)
      .filter((pattern) => pattern.stations.includes(stationId))
      .map((pattern) => pattern.lineId),
  );
  const isFrom = from === stationId;
  const isTo = to === stationId;
  const feature = TRACK_FEATURES.find((candidate) => candidate.between.includes(stationId));
  const ebartNote = feature && ['PITT', 'PCTR', 'ANTC'].includes(stationId) ? feature : undefined;
  return (
    <section className="card station-card" aria-labelledby="station-title">
      <header className="card-head">
        <div>
          <h2 id="station-title" className="card-title">
            {station.name}
          </h2>
          <p className="card-sub">
            {lineIds.length > 1
              ? `Transfer station · ${lineIds.length} lines`
              : net.isTerminal(stationId)
                ? 'End of the line'
                : 'BART station'}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label={
            backLabel ? `Close station details and ${backLabel.toLowerCase()}` : 'Close station details'
          }
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="btn-row">
        <button
          type="button"
          className={`btn ${isFrom ? 'btn-on' : 'btn-primary'}`}
          onClick={onStart}
          aria-pressed={isFrom}
        >
          {isFrom ? <Icon name="check" size={16} /> : <span className="pin-dot">A</span>}
          Start here
        </button>
        <button
          type="button"
          className={`btn ${isTo ? 'btn-on' : 'btn-secondary'}`}
          onClick={onGo}
          aria-pressed={isTo}
        >
          {isTo ? <Icon name="check" size={16} /> : <span className="pin-dot pin-dot-b">B</span>}
          Go here
        </button>
      </div>
      {alerts.length > 0 && (
        <p className="notice notice-warn" role="note">
          <Icon name="alert" size={18} />
          <span>
            {'BART’s alerts feed tags '}
            {alerts.length === 1 ? 'an alert' : `${alerts.length} alerts`}
            {' to this station.'}{' '}
            <button type="button" className="link" onClick={onOpenAlerts}>
              {'Read '}
              {alerts.length === 1 ? 'it' : 'them'}
            </button>
          </span>
        </p>
      )}
      <h3 className="card-h">Lines</h3>
      <ul className="line-list">
        {lineIds.map((lineId) => {
          const line = net.lineById.get(lineId);
          const running = runningLines.has(lineId);
          return (
            <li key={lineId}>
              <LineChip line={line} />
              <span className={`status ${running ? 'status-on' : 'status-off'}`}>
                {running ? 'Runs in the selected service' : 'Not running in the selected service'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="fine">
        {'Service shown: '}
        {describeService(service)}. Based on BART’s published schedule, not live train positions.
      </p>
      {ebartNote && (
        <div className="note-block">
          <h3 className="card-h">eBART Transfer Platform</h3>
          <p>{ebartNote.note}</p>
          <p className="fine">
            {'Source: '}
            <ExternalLink href={ebartNote.source}>BART station page</ExternalLink>
          </p>
        </div>
      )}
      <h3 className="card-h">Address, connections and accessibility</h3>
      <p className="fine">
        BART’s station page has the street address, connecting buses and trains, and elevator information,
        including current elevator outages.
      </p>
      <p className="card-foot">
        <ExternalLink href={station.url}>
          {'Official '}
          {station.name}
          {' page on bart.gov'}
        </ExternalLink>
      </p>
    </section>
  );
}
