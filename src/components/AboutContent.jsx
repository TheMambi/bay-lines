import { ExternalLink } from './ExternalLink';
import { formatDate } from '../lib/format';

export function AboutContent({ net, geographyAttribution }) {
  const meta = net.data.meta;
  const feedExpired = meta.gtfs.feedEndDate < meta.lastVerified;
  return (
    <div className="prose">
      <p className="lede">
        {'Bay Lines is an independent, '}
        <strong>unofficial</strong>
        {
          ' map and route suggester for the BART network. It is not made by, affiliated with, or endorsed by Bay Area Rapid Transit. The line diagram is an original schematic; it is not BART’s system map and does not use BART’s logos.'
        }
      </p>
      <h3>What’s verified, and when</h3>
      <p>
        {'Network data was last checked against BART’s published sources on '}
        <strong>{formatDate(meta.lastVerified)}</strong>
        {'. It comes from BART’s static schedule feed (GTFS, version '}
        {meta.gtfs.feedVersion}).
      </p>
      {feedExpired && (
        <p className="notice notice-info">
          <span>
            The feed’s own listed end date ({formatDate(meta.gtfs.feedEndDate)}
            {') has already passed, although its calendar runs to '}
            {formatDate(meta.gtfs.calendarEndDate)}
            {
              '. The app uses the current published files; BART may publish a newer version, so treat details as “as of '
            }
            {formatDate(meta.lastVerified)}
            ”.
          </span>
        </p>
      )}
      <ul>
        {meta.sources.map((source) => (
          <li key={source.url}>
            <ExternalLink href={source.url}>{source.label}</ExternalLink>
          </li>
        ))}
      </ul>
      <h3>How each part is made</h3>
      <ul>
        <li>
          <strong>Stations, lines, and which trains stop where</strong>
          {
            ' are read from the schedule feed. Only regular service is used: a stopping pattern counts if it runs at least a quarter as often as the busiest pattern on that line and direction (and at least twice), so a single late-night trip that skips a station doesn’t create a fake direct train.'
          }
        </li>
        <li>
          <strong>Route suggestions</strong>
          {
            ' search those real stopping patterns, respecting direction and where each train actually stops. Changing trains costs an assumed '
          }
          {8}
          {' minutes '}
          <em>only to rank options</em>; that number is never shown as a wait.
        </li>
        <li>
          <strong>Riding time</strong>
          {
            ' is the scheduled time from boarding to arriving, taken from the typical (median) stop times of that stopping pattern, pauses at stations included. It excludes waiting, walking between platforms, and delays.'
          }
        </li>
        <li>
          <strong>Reach</strong>
          {
            ' finds the shortest scheduled travel time from your chosen station to every other one, over the same stopping patterns. Each change of train adds the transfer time '
          }
          <em>you</em>
          {
            ' choose (5 minutes to start with), and you can add a wait for your first train (none to start with, which assumes a train is just arriving): BART’s schedule doesn’t say how long either takes, so those numbers are your assumptions, not data. Walking to the station and delays are left out. With a second starting station it shows when the later of two people would arrive, so you can pick a fair place to meet.'
          }
        </li>
        <li>
          <strong>Replay</strong>
          {
            ' draws every trip in the published timetable for a weekday, Saturday or Sunday, placed by its scheduled departure and the typical time between stops. '
          }
          <strong>It is not live.</strong>
          {
            ' It shows what the timetable says should be happening, not where trains are; real trains run early, late, or not at all, and special-event schedules and one-off changes on particular dates are not included.'
          }
        </li>
        <li>
          <strong>Games</strong>
          {
            ' use the same map and schedule. “Today’s set” gives everyone the same questions on the same Pacific date; “Copy my score” only copies text, nothing is sent anywhere. Best scores are kept only in your own browser, if it allows that.'
          }
        </li>
        <li>
          <strong>Fares</strong>
          {' are the station-to-station prices in the schedule feed (version '}
          {meta.gtfs.feedVersion}
          {
            '), including its listed discount categories. The feed doesn’t describe how you pay, so confirm at '
          }
          <ExternalLink href="https://www.bart.gov/tickets">bart.gov/tickets</ExternalLink>.
        </li>
        <li>
          <strong>Addresses, connecting services and elevator information</strong>
          {
            ' are not reproduced here. Each station card links to BART’s own station page, which has them and stays current.'
          }
        </li>
        <li>
          <strong>Service alerts</strong>
          {
            ' come from BART’s official service-alerts feed through this app’s own server, which turns the feed into a form the browser can read. If that fails, you’ll see a clear message, the last good copy (marked as old), and everything else keeps working.'
          }
        </li>
        <li>
          <strong>The land and Bay outline</strong>
          {': '}
          {geographyAttribution ??
            'Natural Earth 1:10m land outline (public domain), generalised and stretched to fit the schematic.'}
          {' It’s only there to orient you.'}
        </li>
      </ul>
      <h3>What this app does not do</h3>
      <ul>
        <li>
          It does not show live train arrivals, delays or positions, and it can’t say when the next train
          leaves. The moving trains in Replay are scheduled, not tracked.
        </li>
        <li>
          It does not plan door to door: no walking, buses or other operators. Reach and route times start and
          end at BART stations.
        </li>
        <li>It does not report elevator or escalator outages.</li>
        <li>The schematic simplifies angles and distances; it is not to scale.</li>
        <li>
          If BART changes its schedule, the app’s data stays as of the date above until it is regenerated from
          a newer feed.
        </li>
      </ul>
      <h3>Keyboard</h3>
      <ul>
        <li>
          <kbd>/</kbd>
          {' jumps to search. On the map: arrow keys pan, '}
          <kbd>+</kbd>
          {' and '}
          <kbd>−</kbd>
          {' zoom, '}
          <kbd>0</kbd>
          {' fits the whole network, '}
          <kbd>Esc</kbd>
          {' clears the selection.'}
        </li>
        <li>
          <kbd>Tab</kbd>
          {' into the stations, then arrow keys move to the nearest station in that direction; '}
          <kbd>Enter</kbd>
          {
            ' opens it (in Reach, it makes that station the starting point). The “All stations” list offers the same stations as plain text.'
          }
        </li>
        <li>
          In Replay, the time-of-day slider moves with the arrow keys, Page Up and Page Down. Trains are also
          listed under “Pick a train”, so nothing depends on clicking a moving target.
        </li>
      </ul>
      <h3>Credits and licences</h3>
      <ul>
        <li>
          Transit data © Bay Area Rapid Transit, used under the{' '}
          <ExternalLink href="https://www.bart.gov/dla">BART Developer License Agreement</ExternalLink>. BART
          and its marks belong to BART.
        </li>
        <li>Land outline from Natural Earth (public domain).</li>
        <li>Typeface: Atkinson Hyperlegible Next, SIL Open Font License 1.1.</li>
      </ul>
    </div>
  );
}
