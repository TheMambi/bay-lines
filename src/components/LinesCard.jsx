import { ExternalLink } from './ExternalLink';
import { Icon } from './Icon';
import { LineChip } from './LineChip';
import { ServicePicker } from './ServicePicker';
import { PERIODS } from '../lib/network';
import { formatClock, minutesBetween } from '../lib/time';

function serviceSpan(net, lineId, day) {
  let first = null;
  let last = null;
  for (const period of PERIODS) {
    for (const pattern of net.activePatterns({ day, period })) {
      if (pattern.lineId !== lineId) {
        continue;
      }
      const slot = pattern.service[day]?.[period];
      if (slot) {
        if (first == null || minutesBetween(slot.first, first) < 0) {
          first = slot.first;
        }
        if (last == null || minutesBetween(slot.last, last) > 0) {
          last = slot.last;
        }
      }
    }
  }
  if (first && last) {
    return { first, last };
  }
  return null;
}

export function LinesCard({ net, service, nowService, usingNow, highlight, onHighlight, onService }) {
  const running = new Set(net.activePatterns(service).map((pattern) => pattern.lineId));
  return (
    <section className="card" aria-labelledby="lines-title">
      <h2 id="lines-title" className="card-title card-title-sm">
        Lines
      </h2>
      <p className="fine">
        Choose a line to highlight it on the map. Lines that don’t run in the selected service are drawn
        dashed.
      </p>
      <ul className="lines-list">
        {net.lines.map((line) => {
          const isRunning = running.has(line.id);
          const span = serviceSpan(net, line.id, service.day);
          const isActive = highlight === line.id;
          return (
            <li key={line.id} className={isActive ? 'is-active' : undefined}>
              <button
                type="button"
                className="line-row"
                aria-pressed={isActive}
                onClick={() => onHighlight(isActive ? null : line.id)}
              >
                <LineChip line={line} muted={!isRunning} />
                <span className="line-meta">
                  <span className="line-ends">{line.endpoints.join(' ↔ ')}</span>
                  <span className="line-status">
                    {isRunning ? 'Running in this service' : 'Not running in this service'}
                    {span
                      ? ` · first–last departure ${formatClock(span.first)}–${formatClock(span.last)}`
                      : ''}
                  </span>
                </span>
              </button>
              <a
                className="icon-btn icon-btn-quiet"
                href={line.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Official ${line.name} line schedule on bart.gov (opens in a new tab)`}
              >
                <Icon name="external" size={16} />
              </a>
            </li>
          );
        })}
      </ul>
      <ServicePicker service={service} nowService={nowService} usingNow={usingNow} onService={onService} />
      <p className="fine">
        “Right now” follows the clock in Pacific time and BART’s holiday-schedule dates from the schedule
        feed. Departure times are the first and last scheduled departures from each line’s end stations in
        regular service; some trips run less often. See{' '}
        <ExternalLink href="https://www.bart.gov/schedules">bart.gov/schedules</ExternalLink>
        {' for the official timetable.'}
      </p>
    </section>
  );
}
