import { ExternalLink } from '../ExternalLink';
import { Icon } from '../Icon';
import { LineChip } from '../LineChip';
import { formatFare, plural } from '../../lib/format';
import { DAYS, PERIODS } from '../../lib/network';
import { planTrips } from '../../lib/routing';
import { DAY_LABELS, PERIOD_LABELS, describeService, formatMinute } from '../../lib/time';
import { TRACK_FEATURES } from '../../map/schematic';

const stationName = (net, id) => net.stationById.get(id).name;

function describeItinerary(net, itinerary) {
  const names = itinerary.legs.map((leg) => net.lineById.get(leg.lineId).name);
  const lineText = names.length === 1 ? `${names[0]} line` : names.map((name) => `${name}`).join(' → ');
  return `${itinerary.transfers === 0 ? 'Direct' : plural(itinerary.transfers, 'transfer')} · ${lineText} · about ${itinerary.rideMinutes} min riding`;
}

// `lastTrain.gone` is false when the train has not left yet but leaves before the rider could arrive.
function lastTrainText(net, lastTrain) {
  const train = `The last ${net.lineById.get(lastTrain.lineId).name} line train toward ${stationName(net, lastTrain.toward)}`;
  const where = `${stationName(net, lastTrain.stationId)} at ${formatMinute(lastTrain.minute)}`;
  return lastTrain.gone ? `${train} left ${where}` : `${train} leaves ${where}, before you could get there`;
}

export function TripPanel(props) {
  const { net, service, from, to, result } = props;
  const feature = TRACK_FEATURES[0];
  return (
    <section className="card trip" aria-labelledby="trip-title">
      <header className="card-head">
        <div>
          <h2 id="trip-title" className="card-title">
            Route suggestion
          </h2>
          <p className="card-sub">
            {stationName(net, from)} <Icon name="arrow" size={14} className="inline-icon" />{' '}
            {stationName(net, to)}
          </p>
        </div>
      </header>
      <div className="btn-row btn-row-tight">
        <button type="button" className="btn btn-secondary btn-sm" onClick={props.onSwap}>
          <Icon name="swap" size={16} />
          {' Swap'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={props.onFit}>
          <Icon name="fit" size={16} />
          {' Show on map'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={props.onClear}>
          <Icon name="close" size={16} />
          {' Clear'}
        </button>
      </div>
      {result.status === 'same-station' && (
        <p className="notice notice-info" role="status">
          <Icon name="info" size={18} />
          <span>Start and destination are the same station. Choose a different destination.</span>
        </p>
      )}
      {result.status === 'unknown-station' && (
        <p className="notice notice-warn" role="alert">
          <Icon name="alert" size={18} />
          <span>
            One of those stations isn’t in the network data. Pick the stations again from the search or the
            map.
          </span>
        </p>
      )}
      {result.status === 'no-route' && <NoRouteNotice {...props} />}
      {result.status === 'ok' && (
        <>
          {result.itineraries.length > 1 && (
            <div role="group" aria-label="Route options" className="options">
              {result.itineraries.map((itinerary, index) => (
                <button
                  key={index}
                  type="button"
                  className="option"
                  aria-pressed={index === props.index}
                  onClick={() => props.onIndex(index)}
                >
                  <span className="option-title">{index === 0 ? 'Suggested' : `Option ${index + 1}`}</span>
                  <span className="option-sub">{describeItinerary(net, itinerary)}</span>
                </button>
              ))}
            </div>
          )}
          {result.lastTrain && (
            <p className="notice notice-info" role="note">
              <Icon name="info" size={18} />
              <span>{lastTrainText(net, result.lastTrain)}, so this suggestion uses other trains.</span>
            </p>
          )}
          <ItineraryDetails
            {...props}
            itinerary={result.itineraries[Math.min(props.index, result.itineraries.length - 1)]}
            feature={feature}
          />
        </>
      )}
      <div className="fine trip-foot">
        <p>
          {'Service used: '}
          <strong>{describeService(service)}</strong>. This is a route suggestion built from BART’s scheduled
          service patterns. It is not a timetable — it can’t tell you when the next train leaves or whether
          service is delayed.
        </p>
        {props.taggedAlerts.length > 0 ? (
          <p className="notice notice-warn" role="note">
            <Icon name="alert" size={18} />
            <span>
              {plural(props.taggedAlerts.length, 'service alert')}
              {' tagged to lines or stations on this route.'}{' '}
              <button type="button" className="link" onClick={props.onOpenAlerts}>
                {'Read '}
                {props.taggedAlerts.length === 1 ? 'it' : 'them'}
              </button>
            </span>
          </p>
        ) : props.alertsUnavailable ? (
          <p>
            Service alerts could not be loaded, so this suggestion has not been checked against them. Check
            bart.gov before you go.
          </p>
        ) : props.systemAlerts > 0 ? (
          <p>
            {'BART’s feed has '}
            {plural(props.systemAlerts, 'alert')}
            {' not tied to a specific line or station.'}{' '}
            <button type="button" className="link" onClick={props.onOpenAlerts}>
              {'Read '}
              {props.systemAlerts === 1 ? 'it' : 'them'}
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function NoRouteNotice({ net, from, to, service, result, onService }) {
  const connectedIn = [];
  for (const day of DAYS) {
    for (const period of PERIODS) {
      if (planTrips(net, { day, period }, from, to).status === 'ok') {
        connectedIn.push({ day, period });
      }
    }
  }
  return (
    <div className="notice notice-warn" role="status">
      <Icon name="alert" size={18} />
      <div>
        <p>
          {result.ended ? 'No regular train still to come connects ' : 'No route between '}
          {stationName(net, from)}
          {' and '}
          {stationName(net, to)}
          {' in '}
          {describeService(service).toLowerCase()}
          {' service.'}
          {result.lastTrain && ` ${lastTrainText(net, result.lastTrain)}.`}
        </p>
        {result.ended && (
          <p>
            A few of the day’s first and last trains run outside the regular pattern. Check{' '}
            <ExternalLink href={net.data.meta.agency.url}>bart.gov</ExternalLink>
            {' for those.'}
          </p>
        )}
        {connectedIn.length > 0 ? (
          <>
            <p>They are connected in:</p>
            <ul className="plain-list">
              {connectedIn.map((option) => (
                <li key={`${option.day}-${option.period}`}>
                  <button type="button" className="link" onClick={() => onService(option)}>
                    {DAY_LABELS[option.day]}
                    {', '}
                    {PERIOD_LABELS[option.period].toLowerCase()}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>They are not connected in any regular service in the schedule data.</p>
        )}
      </div>
    </div>
  );
}

function ItineraryDetails({ net, itinerary, from, to, onStation, feature }) {
  const categories = net.data.fares.categories;
  const adultFare = net.fareCents(from, to, 'adult');
  return (
    <>
      <p className="trip-stats">
        <span>
          <strong>{itinerary.transfers === 0 ? 'Direct' : plural(itinerary.transfers, 'transfer')}</strong>
        </span>
        <span>{plural(itinerary.stopCount, 'stop')}</span>
        <span>
          {'about '}
          <strong>
            {itinerary.rideMinutes}
            {' min'}
          </strong>
          {' riding'}
        </span>
        {adultFare != null && (
          <span>
            <strong>{formatFare(adultFare)}</strong>
            {' adult fare in the schedule feed '}
            <span className="fine">(unverified: see fare details)</span>
          </span>
        )}
      </p>
      <ol className="steps">
        {itinerary.legs.map((leg, index) => (
          <LegStep
            key={index}
            net={net}
            leg={leg}
            first={index === 0}
            oacChange={
              index > 0 &&
              (leg.notes.includes('oac-transfer') || itinerary.legs[index - 1].notes.includes('oac-transfer'))
            }
            onStation={onStation}
            feature={feature}
          />
        ))}
        <li className="step step-end">
          <span className="step-dot step-dot-end" aria-hidden="true">
            B
          </span>
          <div className="step-body">
            <p className="step-title">
              Arrive at{' '}
              <button type="button" className="link" onClick={() => onStation(to)}>
                {stationName(net, to)}
              </button>
            </p>
          </div>
        </li>
      </ol>
      {adultFare != null && (
        <details className="fare">
          <summary>Fare details</summary>
          <table>
            <caption className="sr-only">
              {'Fares from '}
              {stationName(net, from)}
              {' to '}
              {stationName(net, to)}
            </caption>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <th scope="row">{category.name}</th>
                  <td>{formatFare(net.fareCents(from, to, category.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">
            {'From the fare table in BART’s schedule feed (version '}
            {net.data.meta.gtfs.feedVersion}
            ). The table has one price per station pair and doesn’t say how you pay, so cash, Clipper and
            discount-eligibility rules may differ — check{' '}
            <ExternalLink href="https://www.bart.gov/tickets">bart.gov</ExternalLink>
            {' before you travel.'}
          </p>
        </details>
      )}
      <p className="fine">
        Riding time is BART’s scheduled time from boarding to arriving, pauses at stations included. It leaves
        out waiting, walking between platforms, and delays.
      </p>
    </>
  );
}

function LegStep({ net, leg, first, oacChange, onStation, feature }) {
  const line = net.lineById.get(leg.lineId);
  const between = leg.stops.slice(1, -1);
  const hops = leg.stops.length - 1;
  // Shown on the step where the rider changes to or from the connector, whichever leg comes first.
  const oacTransfer =
    oacChange && net.data.transferTimes.find((transferTime) => transferTime.stationId === leg.from);
  return (
    <li className="step" style={{ '--rail': line.color }}>
      <span className="step-dot" style={{ background: line.color }} aria-hidden="true">
        {first ? 'A' : <Icon name="transfer" size={14} />}
      </span>
      <div className="step-body">
        <p className="step-title">
          {first ? 'Board at' : 'Change at'}{' '}
          <button type="button" className="link" onClick={() => onStation(leg.from)}>
            {stationName(net, leg.from)}
          </button>
        </p>
        <p className="step-line">
          <LineChip line={line} />{' '}
          <span>
            {'toward '}
            {stationName(net, leg.toward)}
          </span>
        </p>
        <p className="muted">
          {plural(hops, 'stop')}
          {' to'}{' '}
          <button type="button" className="link" onClick={() => onStation(leg.to)}>
            {stationName(net, leg.to)}
          </button>{' '}
          {'· about '}
          {leg.minutes}
          {' min'}
        </p>
        {leg.alsoWorks.length > 0 && (
          <p className="fine">
            Also works for this stretch:{' '}
            {leg.alsoWorks.map((alsoWork, index) => (
              <span key={alsoWork.patternId}>
                {index > 0 && ', '}
                {net.lineById.get(alsoWork.lineId).name}
                {' toward '}
                {stationName(net, alsoWork.toward)}
              </span>
            ))}
            .
          </p>
        )}
        {!first && leg.changeOptions.length > 0 && (
          <p className="fine">
            You could also change earlier, at{' '}
            {leg.changeOptions.map((changeOption, index) => (
              <span key={changeOption}>
                {index > 0 && ', '}
                {stationName(net, changeOption)}
              </span>
            ))}
            , because both trains stop there.
          </p>
        )}
        {leg.notes.includes('ebart-transfer') && (
          <p className="fine">
            {feature.note} <ExternalLink href={feature.source}>Source</ExternalLink>
          </p>
        )}
        {oacTransfer && (
          <p className="fine">
            {'Allow at least '}
            {Math.round(oacTransfer.minSeconds / 60)}
            {
              ' minutes to change between BART and the Oakland Airport Connector (transfer time in BART’s schedule feed).'
            }
          </p>
        )}
        {between.length > 0 && (
          <details className="stops">
            <summary>
              {plural(between.length, 'stop')}
              {' in between'}
            </summary>
            <ol>
              {between.map((stopId) => (
                <li key={stopId}>
                  <button type="button" className="link" onClick={() => onStation(stopId)}>
                    {stationName(net, stopId)}
                  </button>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </li>
  );
}
