// GET /api/alerts: BART's GTFS-Realtime service alerts, decoded to JSON.
// The browser can't read the protobuf feed directly, so this function fetches it,
// decodes it, and lets Vercel's CDN cache the result for a minute.
import { FEED_URL, decodeAlertsFeed } from './_lib/alerts-feed.js';

const FETCH_TIMEOUT_MS = 8000;

// Last good payload, kept per warm instance so a brief upstream outage
// can still be answered (marked stale) instead of failing outright.
let lastGood = null;

const json = (body, status, cacheControl) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl },
  });

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405, 'no-store');
    }
    try {
      const upstream = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!upstream.ok) throw new Error(`upstream status ${upstream.status}`);
      const payload = decodeAlertsFeed(new Uint8Array(await upstream.arrayBuffer()));
      lastGood = payload;
      return json(payload, 200, 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
    } catch (error) {
      console.error('alerts proxy failed:', error.message);
      if (lastGood) return json({ ...lastGood, stale: true }, 200, 'no-store');
      return json({ error: 'BART’s alerts feed could not be reached.' }, 502, 'no-store');
    }
  },
};
