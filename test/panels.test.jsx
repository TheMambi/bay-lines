import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReachPanel } from '../src/components/ReachPanel';
import { net } from '../src/lib/network';
import { computeReach } from '../src/lib/reach';

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
