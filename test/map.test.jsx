// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, click, mount, pointer, serveAlerts, unmount } from './dom';
import { App } from '../src/App';

const mapView = (app) => app.querySelector('.map-svg > g').getAttribute('transform');

let app;
let surface;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09T10:00:00-08:00'));
  localStorage.clear();
  serveAlerts({ feedTimestamp: null, alerts: [], stale: false });
  history.replaceState(null, '', '/');
  app = await mount(<App />);
  await advance(1000);
  surface = app.querySelector('.map-surface');
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe('dragging the map', () => {
  it('pans while the button is held and stops when it is released', async () => {
    const before = mapView(app);
    await pointer(surface, 'pointerdown', { clientX: 600, clientY: 400, buttons: 1 });
    await pointer(surface, 'pointermove', { clientX: 560, clientY: 380, buttons: 1 });
    const dragged = mapView(app);
    expect(dragged).not.toBe(before);
    await pointer(surface, 'pointerup', { clientX: 560, clientY: 380 });
    await pointer(surface, 'pointermove', { clientX: 300, clientY: 200 });
    expect(mapView(app)).toBe(dragged);
  });

  it('does not follow the mouse after a press whose release the map never saw', async () => {
    const before = mapView(app);
    await pointer(surface, 'pointerdown', { clientX: 600, clientY: 400, buttons: 1 });
    // The button came up over the panel, so no pointerup reached the map.
    await pointer(surface, 'pointermove', { clientX: 300, clientY: 200 });
    await pointer(surface, 'pointermove', { clientX: 200, clientY: 100 });
    expect(mapView(app)).toBe(before);
  });
});

describe('choosing a station on the map', () => {
  it('opens the card of the station that was activated', async () => {
    await click(app.querySelector('#station-ROCK'));
    expect(app.querySelector('.panel .card-title').textContent).toBe('Rockridge');
    expect(location.hash).toBe('#station=ROCK');
  });
});
