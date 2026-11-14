import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, decodeAlertsFeed } from '../api/_lib/alerts-feed.js';
import { HEADER, encodeFeed, text } from './feed.js';

const encode = (entity) => encodeFeed({ header: HEADER, entity });

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

describe('GET /api/alerts while BART is failing or slow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const failing = () =>
    vi.fn(async () => {
      throw new Error('network down');
    });

  it('calls BART once for ten requests in a row during an outage, then waits before retrying', async () => {
    const { handler, FAILURE_BACKOFF_MS } = await loadHandler();
    const upstream = failing();
    vi.stubGlobal('fetch', upstream);
    for (let i = 0; i < 10; i++) {
      const response = await handler.fetch(get(`/api/alerts?n=${i}`));
      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(upstream).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FAILURE_BACKOFF_MS + 1);
    await handler.fetch(get());
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('calls BART once for ten requests in a row when its good copy has expired', async () => {
    const { handler, MIN_REFETCH_MS } = await loadHandler();
    vi.stubGlobal('fetch', async () => new Response(feedBytes));
    await handler.fetch(get());
    vi.advanceTimersByTime(MIN_REFETCH_MS + 1);
    const upstream = failing();
    vi.stubGlobal('fetch', upstream);
    for (let i = 0; i < 10; i++) {
      const response = await handler.fetch(get());
      expect((await response.json()).stale).toBe(true);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('shares one call to BART between ten requests that arrive together', async () => {
    const { handler } = await loadHandler();
    let answer;
    const upstream = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal('fetch', upstream);
    const pending = Array.from({ length: 10 }, () => handler.fetch(get()));
    answer(new Response(feedBytes));
    const responses = await Promise.all(pending);
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('shares one failed call between ten requests that arrive together', async () => {
    const { handler } = await loadHandler();
    const upstream = failing();
    vi.stubGlobal('fetch', upstream);
    const responses = await Promise.all(Array.from({ length: 10 }, () => handler.fetch(get())));
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(502));
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('stops serving the last good copy once it is too old', async () => {
    const { handler, MAX_STALE_MS } = await loadHandler();
    vi.stubGlobal('fetch', async () => new Response(feedBytes));
    await handler.fetch(get());
    vi.stubGlobal('fetch', failing());
    vi.advanceTimersByTime(MAX_STALE_MS - 1000);
    expect((await handler.fetch(get())).status).toBe(200);
    vi.advanceTimersByTime(60000);
    expect((await handler.fetch(get())).status).toBe(502);
  });

  it('refuses to follow a redirect away from the feed address', async () => {
    const { handler } = await loadHandler();
    const upstream = vi.fn(async () => new Response(feedBytes));
    vi.stubGlobal('fetch', upstream);
    await handler.fetch(get());
    expect(upstream.mock.calls[0][1].redirect).toBe('error');
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

  it('drops route and stop ids that are too long to be real', () => {
    const long = 'R'.repeat(100000);
    const informedEntity = [{ routeId: long }, { stopId: long }, { routeId: '11' }, { stopId: 'A10-1' }];
    const payload = decodeAlertsFeed(encode([{ id: 'A', alert: { headerText: text('h'), informedEntity } }]));
    expect(payload.alerts[0].routes).toEqual(['11']);
    expect(payload.alerts[0].stations).toEqual(['LAKE']);
    expect(JSON.stringify(payload).length).toBeLessThan(2000);
  });
});
