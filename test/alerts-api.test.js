import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { LIMITS, decodeAlertsFeed } from '../api/_lib/alerts-feed.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const text = (t) => ({ translation: [{ text: t, language: 'en' }] });
const encode = (entity) =>
  FeedMessage.encode(
    FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', timestamp: 1794169068 }, entity }),
  ).finish();

const feedBytes = encode([{ id: 'BSA_1', alert: { headerText: text('Elevator out') } }]);
const get = (path = '/api/alerts') => new Request(`http://localhost${path}`);

// The handler keeps its last good payload in module state, so each test loads a fresh copy.
async function loadHandler() {
  vi.resetModules();
  const module = await import('../api/alerts.js');
  return { handler: module.default, ...module };
}

describe('GET /api/alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects methods other than GET and HEAD', async () => {
    const { handler } = await loadHandler();
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await handler.fetch(new Request('http://localhost/api/alerts', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers repeat requests from memory instead of calling BART again', async () => {
    const { handler, MIN_REFETCH_MS } = await loadHandler();
    const upstream = vi.fn(async () => new Response(feedBytes));
    vi.stubGlobal('fetch', upstream);
    const first = await handler.fetch(get());
    const second = await handler.fetch(get('/api/alerts?cachebust=1'));
    expect(first.status).toBe(200);
    expect((await second.json()).alerts).toHaveLength(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MIN_REFETCH_MS + 1);
    await handler.fetch(get());
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('refuses an oversized feed and reports the outage', async () => {
    const { handler, MAX_FEED_BYTES } = await loadHandler();
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(MAX_FEED_BYTES + 1)));
    const response = await handler.fetch(get());
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('serves the last good copy, marked stale, when BART is unreachable', async () => {
    const { handler, MIN_REFETCH_MS } = await loadHandler();
    vi.stubGlobal('fetch', async () => new Response(feedBytes));
    await handler.fetch(get());
    vi.advanceTimersByTime(MIN_REFETCH_MS + 1);
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    const response = await handler.fetch(get());
    expect(response.status).toBe(200);
    expect((await response.json()).stale).toBe(true);
  });
});

describe('decodeAlertsFeed limits', () => {
  it('caps the number of alerts and the length of their text', () => {
    const entity = Array.from({ length: LIMITS.alerts + 20 }, (_, i) => ({
      id: `A${i}`,
      alert: {
        headerText: text('h'.repeat(LIMITS.headline * 2)),
        descriptionText: text('d'.repeat(LIMITS.description * 2)),
        url: text(`https://www.bart.gov/${'x'.repeat(LIMITS.url)}`),
      },
    }));
    const { alerts } = decodeAlertsFeed(encode(entity));
    expect(alerts).toHaveLength(LIMITS.alerts);
    expect(alerts[0].headline).toHaveLength(LIMITS.headline);
    expect(alerts[0].description).toHaveLength(LIMITS.description);
    expect(alerts[0].url).toBeNull();
  });
});
