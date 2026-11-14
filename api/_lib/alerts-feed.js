import { decodeFeedMessage } from './feed-message.js';
import { STOP_PARENTS } from './stop-parents.js';

export const FEED_URL = 'https://api.bart.gov/gtfsrt/alerts.aspx';

// Ceilings on what one response can carry. BART's real alerts sit far below all of them;
// they keep a malformed or hostile feed from becoming a huge payload for every visitor.
export const LIMITS = {
  alerts: 100,
  headline: 300,
  description: 4000,
  url: 500,
  id: 100,
  tags: 100,
  tagId: 40,
  periods: 20,
};

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function pickText(translated, max) {
  const translations = translated?.translation ?? [];
  const english = translations.find((t) => !t.language || t.language.toLowerCase().startsWith('en'));
  const text = (english ?? translations[0])?.text?.trim();
  return text ? clip(text, max) : null;
}

// A clipped link is a broken link, so an over-long one is dropped instead.
const toUrl = (text) => (text && text.length <= LIMITS.url ? text : null);

const toMillis = (seconds) => (seconds ? Number(seconds) * 1000 : null);

// BART's route and stop ids are under ten characters. A clipped id would name something
// else, so an over-long one is dropped.
const isTagId = (id) => Boolean(id) && id.length <= LIMITS.tagId;

const toStationId = (stopId) => {
  const id = String(stopId).trim().toUpperCase();
  return STOP_PARENTS[id] ?? id;
};

/**
 * Decode a GTFS-Realtime alerts feed into the small JSON shape the app reads.
 * Throws if the bytes are not a valid FeedMessage.
 */
export function decodeAlertsFeed(bytes) {
  const message = decodeFeedMessage(bytes);
  const alerts = (message.entity ?? [])
    .filter((entity) => entity.alert && !entity.isDeleted)
    .slice(0, LIMITS.alerts)
    .map((entity) => {
      const { alert } = entity;
      const informed = (alert.informedEntity ?? []).slice(0, LIMITS.tags);
      return {
        id: String(entity.id).slice(0, LIMITS.id),
        headline: pickText(alert.headerText, LIMITS.headline),
        description: pickText(alert.descriptionText, LIMITS.description) ?? '',
        effect: alert.effect ?? null,
        routes: [...new Set(informed.map((e) => e.routeId).filter(isTagId))],
        stations: [
          ...new Set(
            informed
              .map((e) => e.stopId)
              .filter(isTagId)
              .map(toStationId),
          ),
        ],
        activePeriods: (alert.activePeriod ?? [])
          .slice(0, LIMITS.periods)
          .map((p) => ({ start: toMillis(p.start), end: toMillis(p.end) })),
        url: toUrl(pickText(alert.url, LIMITS.url + 1)),
      };
    });
  return { feedTimestamp: toMillis(message.header?.timestamp), alerts, stale: false };
}
