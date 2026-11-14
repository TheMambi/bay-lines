import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutContent, SOURCE_URL } from '../src/components/AboutContent';
import { ReachPanel } from '../src/components/ReachPanel';
import { TripPanel } from '../src/components/trip/TripPanel';
import { net } from '../src/lib/network';
import { computeReach } from '../src/lib/reach';
import { planTrips } from '../src/lib/routing';

const WEEKDAY = { day: 'weekday', period: 'day' };
const noop = () => {};

// The panels are drawn to plain HTML, which needs no browser. Clicks and timers are not covered here.
const reachPanel = (props) =>
  renderToStaticMarkup(
    <ReachPanel
      net={net}
      service={WEEKDAY}
      nowService={WEEKDAY}
      usingNow={false}
      onService={noop}
      onOrigin={noop}
      onOrigin2={noop}
      picking2={false}
      onPick2={noop}
      meeting={null}
      horizon={30}
      onHorizon={noop}
      allowance={5}
      onAllowance={noop}
      firstWait={0}
      onFirstWait={noop}
      onExpand={noop}
      onPlan={noop}
      {...props}
    />,
  );

describe('Reach panel', () => {
  it('asks for a station only while none is chosen', () => {
    expect(reachPanel({ origin: null, origin2: null, reach: null })).toContain('Nothing chosen yet');
  });

  it('keeps the list for Person A when Person B picks the same station', () => {
    const html = reachPanel({ origin: 'EMBR', origin2: 'EMBR', reach: computeReach(net, WEEKDAY, 'EMBR') });
    expect(html).toContain('Person B starts at the same station as Person A');
    expect(html).not.toContain('Nothing chosen yet');
    expect(html).toContain('Within 30 minutes');
    expect(html).toContain('Plan trip from Embarcadero to Montgomery Street');
  });
});

const tripPanel = (from, to, service = WEEKDAY, nowMinute) =>
  renderToStaticMarkup(
    <TripPanel
      net={net}
      service={service}
      from={from}
      to={to}
      result={planTrips(net, service, from, to, nowMinute)}
      index={0}
      onIndex={noop}
      onStation={noop}
      onService={noop}
      onSwap={noop}
      onClear={noop}
      onFit={noop}
      systemAlerts={0}
      taggedAlerts={[]}
      onOpenAlerts={noop}
      alertsUnavailable={false}
    />,
  );

describe('Trip panel', () => {
  it('shows the Oakland Airport Connector transfer time on trips to the airport and from it', () => {
    for (const [from, to] of [
      ['EMBR', 'OAKL'],
      ['OAKL', 'EMBR'],
    ]) {
      const html = tripPanel(from, to);
      expect(html, `${from} to ${to}`).toContain('Allow at least 4 minutes');
      expect(html.match(/Allow at least/g), `${from} to ${to}`).toHaveLength(1);
      expect(html.indexOf('Change at')).toBeLessThan(html.indexOf('Allow at least'));
    }
  });

  it('says in plain words when the last train of a line has gone', () => {
    const evening = tripPanel('DALY', 'BERY', WEEKDAY, 20 * 60);
    expect(evening).toContain(
      'The last Green line train toward Berryessa / North San Jose left Daly City at 7:20 PM, so this suggestion uses other trains.',
    );
    expect(tripPanel('DALY', 'BERY', WEEKDAY, 12 * 60)).not.toContain('The last');
    expect(tripPanel('DALY', 'BERY')).not.toContain('The last');
  });

  it('says when no regular train is left, and why', () => {
    const html = tripPanel('RICH', 'MLBR', WEEKDAY, 20 * 60);
    expect(html).toContain('No regular train still to come connects Richmond and Millbrae');
    expect(html).toContain('The last Red line train toward Millbrae');
    expect(html).toContain('left Richmond at 7:31 PM.');
    expect(html).toContain('They are connected in:');
  });
});

describe('About text', () => {
  const about = (today) => renderToStaticMarkup(<AboutContent net={net} today={today} />);

  it('says nothing about an ended timetable while the calendar still runs', () => {
    expect(about(net.data.meta.gtfs.calendarEndDate)).not.toContain('This timetable ended');
  });

  it('warns once today is past the end of the calendar', () => {
    const html = about('2027-02-01');
    expect(html).toContain('This timetable ended on Jan 10, 2027.');
    expect(html).toContain('before you travel');
  });

  it('shows the app’s own copyright, licence and a link to its source', () => {
    const html = about('2026-11-13');
    expect(html).toContain('copyright © 2026 TheMambi');
    expect(html).toContain('GNU Affero General Public License');
    expect(html).toContain('no warranty');
    expect(html).toContain(`href="${SOURCE_URL}"`);
    expect(html).toContain('href="/third-party-licenses.md"');
  });
});
