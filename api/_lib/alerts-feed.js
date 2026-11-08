import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { STOP_PARENTS } from './stop-parents.js';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

export const FEED_URL = 'https://api.bart.gov/gtfsrt/alerts.aspx';

function pickText(translated) {
  const translations = translated?.translation ?? [];
  const english = translations.find((t) => !t.language || t.language.toLowerCase().startsWith('en'));
  return (english ?? translations[0])?.text?.trim() || null;
}

const toMillis = (seconds) => (seconds ? Number(seconds) * 1000 : null);

const toStationId = (stopId) => {
  const id = String(stopId).trim().toUpperCase();
  return STOP_PARENTS[id] ?? id;
};

/**
 * Decode a GTFS-Realtime alerts feed into the small JSON shape the app reads.
 * Throws if the bytes are not a valid FeedMessage.
 */
export function decodeAlertsFeed(bytes) {
  const message = FeedMessage.toObject(FeedMessage.decode(bytes), { longs: Number, enums: String });
  const alerts = (message.entity ?? [])
    .filter((entity) => entity.alert && !entity.isDeleted)
    .map((entity) => {
      const { alert } = entity;
      const informed = alert.informedEntity ?? [];
      return {
        id: String(entity.id),
        headline: pickText(alert.headerText),
        description: pickText(alert.descriptionText) ?? '',
        effect: alert.effect ?? null,
        routes: [
          ...new Set(
            informed
              .map((e) => e.routeId)
              .filter(Boolean)
              .map(String),
          ),
        ],
        stations: [
          ...new Set(
            informed
              .map((e) => e.stopId)
              .filter(Boolean)
              .map(toStationId),
          ),
        ],
        activePeriods: (alert.activePeriod ?? []).map((p) => ({
          start: toMillis(p.start),
          end: toMillis(p.end),
        })),
        url: pickText(alert.url),
      };
    });
  return { feedTimestamp: toMillis(message.header?.timestamp), alerts, stale: false };
}
