// GET /api/alerts: BART's GTFS-Realtime service alerts, decoded to JSON.
// The browser can't read the protobuf feed directly, so this function fetches it,
// decodes it, and lets Vercel's CDN cache the result for a minute.
import { FEED_URL, decodeAlertsFeed } from './_lib/alerts-feed.js';

const FETCH_TIMEOUT_MS = 8000;

// BART's feed is a few kilobytes. Anything far beyond that is not the feed, so it is
// refused before it is buffered and decoded.
export const MAX_FEED_BYTES = 1024 * 1024;

// A warm instance answers from memory for this long. The CDN cache is keyed by the full
// URL, so without this a caller could add a throwaway query string to every request and
// turn each one into a request to BART.
export const MIN_REFETCH_MS = 30000;

// After a failed attempt the function answers from memory for this long before it tries
// BART again, so an outage is not met with one upstream request per visitor.
export const FAILURE_BACKOFF_MS = 15000;

// The last good copy is served, marked stale, for at most this long after it was read.
export const MAX_STALE_MS = 15 * 60 * 1000;

const FRESH_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=120';

// Last good payload, kept per warm instance so a brief upstream outage
// can still be answered (marked stale) instead of failing outright.
let lastGood = null;
let lastGoodAt = 0;
let lastFailedAt = -Infinity;
// Callers that arrive while a request to BART is under way wait for that one request.
let inFlight = null;

const json = (body, status, cacheControl, extraHeaders) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });

async function readFeed() {
  const upstream = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // The feed has one fixed address. A redirect away from it is treated as an outage.
    redirect: 'error',
  });
  if (!upstream.ok) throw new Error(`upstream status ${upstream.status}`);
  if (Number(upstream.headers.get('content-length')) > MAX_FEED_BYTES) {
    throw new Error('upstream feed too large');
  }
  // content-length can be absent or wrong, so the bytes are counted as they arrive.
  const chunks = [];
  let size = 0;
  for await (const chunk of upstream.body) {
    size += chunk.byteLength;
    if (size > MAX_FEED_BYTES) throw new Error('upstream feed too large');
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Resolves to the new payload, or to null when BART could not be read.
function refresh() {
  inFlight ??= readFeed()
    .then((bytes) => {
      lastGood = decodeAlertsFeed(bytes);
      lastGoodAt = Date.now();
      return lastGood;
    })
    .catch((error) => {
      lastFailedAt = Date.now();
      console.error('alerts proxy failed:', error.message);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405, 'no-store', { allow: 'GET, HEAD' });
    }
    if (lastGood && Date.now() - lastGoodAt < MIN_REFETCH_MS) {
      return json(lastGood, 200, FRESH_CACHE);
    }
    const backingOff = Date.now() - lastFailedAt < FAILURE_BACKOFF_MS;
    const payload = backingOff ? null : await refresh();
    if (payload) return json(payload, 200, FRESH_CACHE);
    if (lastGood && Date.now() - lastGoodAt < MAX_STALE_MS) {
      return json({ ...lastGood, stale: true }, 200, 'no-store');
    }
    return json({ error: 'BART’s alerts feed could not be reached.' }, 502, 'no-store');
  },
};
