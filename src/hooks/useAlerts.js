import { useCallback, useEffect, useRef, useState } from 'react';

const ALERT_REFRESH_MS = 90000;

function assertPayload(data) {
  if (!data || !Array.isArray(data.alerts)) throw new Error('unexpected alerts payload');
  return data;
}

/**
 * Polls the app's /api/alerts proxy while the page is visible.
 * State: { kind: 'loading' } | { kind: 'ready', data, receivedAt }
 *      | { kind: 'error', message, lastGood?: { data, receivedAt } }
 */

/**
 * Polls the app's /api/alerts proxy while the page is visible.
 * State: { kind: 'loading' } | { kind: 'ready', data, receivedAt }
 *      | { kind: 'error', message, lastGood?: { data, receivedAt } }
 */
export function useAlerts(url = '/api/alerts') {
  const [state, setState] = useState({ kind: 'loading' });
  const lastGoodRef = useRef(undefined);
  const requestIdRef = useRef(0);
  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = assertPayload(await response.json());
      if (requestId !== requestIdRef.current) return;
      const good = { data, receivedAt: Date.now() };
      lastGoodRef.current = good;
      setState({ kind: 'ready', ...good });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({
        kind: 'error',
        message: 'The app couldn’t reach BART’s alerts feed. It will try again shortly.',
        lastGood: lastGoodRef.current,
      });
    }
  }, [url]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, ALERT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  return { state, refresh };
}
