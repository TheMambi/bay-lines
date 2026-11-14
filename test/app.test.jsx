// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, click, mount, serveAlerts, unmount } from './dom';
import { App } from '../src/App';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

const NO_ALERTS = { feedTimestamp: 1794169068000, alerts: [], stale: false };
const alertOf = (overrides) => ({
  id: 'BSA_1',
  headline: 'Elevator out',
  description: 'The platform elevator is out of service.',
  effect: 'ACCESSIBILITY_ISSUE',
  routes: [],
  stations: ['12TH'],
  activePeriods: [],
  url: null,
  ...overrides,
});

// 2026-11-09 is a Monday. Pacific time is UTC-8 in November.
const MONDAY_10AM = new Date('2026-11-09T10:00:00-08:00');

const button = (container, name) =>
  [...container.querySelectorAll('button')].find(
    (el) => el.getAttribute('aria-label') === name || el.textContent.trim() === name,
  );
const chosenOption = (container) =>
  container.querySelector('.option[aria-pressed="true"] .option-title')?.textContent;
const announcement = (container) => container.querySelector('.sr-only[aria-live="polite"]').textContent;
const openApp = async (hash = '', now = MONDAY_10AM) => {
  vi.setSystemTime(now);
  history.replaceState(null, '', `/${hash}`);
  return mount(<App />);
};
const followLink = async (hash) => {
  history.replaceState(null, '', `/${hash}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await advance(200);
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  serveAlerts(NO_ALERTS);
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe('a chosen route option', () => {
  it('stays chosen while the clock ticks under "Right now"', async () => {
    const app = await openApp('#from=12TH&to=BAYF');
    await advance(200);
    expect(chosenOption(app)).toBe('Suggested');
    await click(app.querySelectorAll('.option')[1]);
    expect(chosenOption(app)).toBe('Option 2');
    const spoken = announcement(app);
    for (let tick = 0; tick < 3; tick++) {
      await advance(61000);
    }
    expect(chosenOption(app)).toBe('Option 2');
    // The route is read out once. A repeat would add a space to make screen readers say it again.
    expect(announcement(app)).toBe(spoken);
  });

  it('goes back to the suggested one when the trip changes', async () => {
    const app = await openApp('#from=12TH&to=BAYF');
    await click(app.querySelectorAll('.option')[1]);
    await click(button(app, 'Swap start and destination'));
    expect(chosenOption(app)).toBe('Suggested');
  });
});

describe('service alerts', () => {
  it('lists what the feed sends', async () => {
    serveAlerts({ ...NO_ALERTS, alerts: [alertOf()] });
    const app = await openApp();
    expect(button(app, 'Service alerts, 1 alert listed')).toBeTruthy();
    await click(button(app, 'Service alerts, 1 alert listed'));
    expect(app.querySelector('.alert-item h3').textContent).toBe('Elevator out');
  });

  it.each([
    ['an alert with no description', { ...NO_ALERTS, alerts: [alertOf({ description: undefined })] }],
    ['an alert whose stations are not a list', { ...NO_ALERTS, alerts: [alertOf({ stations: '12TH' })] }],
    ['alerts that are not a list', { ...NO_ALERTS, alerts: { 0: alertOf() } }],
    ['no body worth the name', null],
  ])('shows the error state, and keeps the app, for %s', async (_, body) => {
    serveAlerts(body);
    const app = await openApp('#from=12TH&to=BAYF');
    expect(button(app, 'Service alerts, unavailable')).toBeTruthy();
    expect(chosenOption(app)).toBe('Suggested');
    await click(button(app, 'Service alerts, unavailable'));
    expect(app.querySelector('.alerts [role="alert"]').textContent).toContain(
      'Service alerts aren’t available right now.',
    );
  });

  it('keeps the last good copy when a later refresh is unreadable', async () => {
    serveAlerts({ ...NO_ALERTS, alerts: [alertOf()] });
    const app = await openApp();
    serveAlerts({ ...NO_ALERTS, alerts: [alertOf({ id: 7 })] });
    await advance(91000);
    await click(button(app, 'Service alerts, 1 alert listed'));
    expect(app.querySelector('.alerts [role="alert"]').textContent).toContain(
      'Couldn’t refresh service alerts.',
    );
    expect(app.querySelector('.alert-item h3').textContent).toBe('Elevator out');
  });

  it('shows the error state when the server answers with an error', async () => {
    serveAlerts({ error: 'upstream' }, 502);
    const app = await openApp();
    expect(button(app, 'Service alerts, unavailable')).toBeTruthy();
  });
});

describe('the error screen', () => {
  it('replaces a part of the app that throws while drawing', async () => {
    const Broken = () => {
      throw new Error('boom');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = await mount(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    logged.mockRestore();
    expect(page.querySelector('[role="alert"]').textContent).toContain('Something went wrong');
    expect(button(page, 'Reload the page')).toBeTruthy();
  });

  it('stays out of the way while nothing is wrong', async () => {
    const page = await mount(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(page.textContent).toBe('fine');
  });
});

describe('a link pasted into a tab that already shows the app', () => {
  it('opens the trip it names', async () => {
    const app = await openApp();
    expect(app.querySelector('.options')).toBeNull();
    await followLink('#from=EMBR&to=ROCK&service=saturday:evening');
    expect(button(app, 'Plan a trip').getAttribute('aria-pressed')).toBe('true');
    expect(app.querySelector('.panel').textContent).toContain('Embarcadero');
    expect(app.querySelector('.panel').textContent).toContain('Rockridge');
    expect(location.hash).toBe('#from=EMBR&to=ROCK&service=saturday%3Aevening');
  });

  it('opens Reach with the settings it names, and replaces the earlier view', async () => {
    const app = await openApp('#from=12TH&to=BAYF');
    await followLink('#mode=reach&origin=DALY&within=45&wait=3');
    expect(button(app, 'Reach: how far can I get?').getAttribute('aria-pressed')).toBe('true');
    expect(app.querySelector('.panel').textContent).toContain('Within 45 minutes');
    expect(location.hash).toBe('#mode=reach&origin=DALY&within=45&wait=3');
  });

  it('ignores stations and modes it does not know', async () => {
    const app = await openApp();
    await followLink('#from=NOPE&to=ROCK&mode=teleport');
    expect(app.querySelector('.options')).toBeNull();
    expect(location.hash).toBe('#to=ROCK');
  });
});

describe('the footer', () => {
  const footer = (app) => app.querySelector('.panel-foot').textContent;

  it('says nothing about the timetable while its calendar still runs', async () => {
    const app = await openApp('', new Date('2027-01-10T23:00:00-08:00'));
    expect(footer(app)).not.toContain('This timetable ended');
  });

  it('says the timetable has ended once the Pacific date is past its calendar', async () => {
    const app = await openApp('', new Date('2027-02-01T10:00:00-08:00'));
    expect(footer(app)).toContain('This timetable ended on Jan 10, 2027.');
    await click(button(app, 'About this map, data sources and limitations'));
    expect(app.querySelector('.prose .notice-warn').textContent).toContain('This timetable ended');
  });
});
