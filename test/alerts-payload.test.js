import { describe, expect, it } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { decodeAlertsFeed } from '../api/_lib/alerts-feed.js';
import { assertAlertsPayload, tagAlerts } from '../src/lib/alerts';
import { net } from '../src/lib/network';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const text = (t) => ({ translation: [{ text: t, language: 'en' }] });
const encode = (entity) =>
  FeedMessage.encode(
    FeedMessage.fromObject({ header: { gtfsRealtimeVersion: '2.0', timestamp: 1794169068 }, entity }),
  ).finish();

const alert = (overrides) => ({
  id: 'BSA_1',
  headline: 'Elevator out',
  description: 'The platform elevator is out of service.',
  effect: 'ACCESSIBILITY_ISSUE',
  routes: ['1'],
  stations: ['12TH'],
  activePeriods: [{ start: 1794169068000, end: null }],
  url: null,
  ...overrides,
});
const payload = (...alerts) => ({ feedTimestamp: 1794169068000, alerts, stale: false });

describe('assertAlertsPayload', () => {
  it('accepts what the alerts function sends, with and without the optional parts', () => {
    const decoded = decodeAlertsFeed(
      encode([
        { id: 'BSA_1', alert: { headerText: text('Elevator out') } },
        {
          id: 'BSA_2',
          alert: {
            headerText: text('Delays'),
            descriptionText: text('Ten minute delays toward Antioch.'),
            effect: 'SIGNIFICANT_DELAYS',
            informedEntity: [{ routeId: '1' }, { stopId: '12TH_1' }],
            activePeriod: [{ start: 1794169068 }],
            url: text('https://www.bart.gov/schedules/advisories'),
          },
        },
      ]),
    );
    const data = JSON.parse(JSON.stringify(decoded));
    expect(assertAlertsPayload(data)).toBe(data);
    expect(assertAlertsPayload(payload())).toEqual(payload());
    expect(tagAlerts(net, data.alerts).map((entry) => entry.tagged)).toEqual([false, true]);
  });

  it('rejects a payload that is not a list of alerts', () => {
    for (const data of [null, undefined, 'alerts', {}, { alerts: null }, { alerts: {} }]) {
      expect(() => assertAlertsPayload(data)).toThrow('unexpected alerts payload');
    }
  });

  it('rejects the whole payload when one alert is malformed', () => {
    const malformed = [
      {},
      null,
      'alert',
      alert({ id: 7 }),
      alert({ description: undefined }),
      alert({ description: { text: 'Delays' } }),
      alert({ headline: { text: 'Delays' } }),
      alert({ routes: undefined }),
      alert({ routes: 'yellow' }),
      alert({ routes: [1] }),
      alert({ stations: undefined }),
      alert({ stations: [null] }),
      alert({ activePeriods: undefined }),
      alert({ activePeriods: [null] }),
    ];
    for (const item of malformed) {
      expect(() => assertAlertsPayload(payload(alert(), item)), JSON.stringify(item)).toThrow(
        'unexpected alerts payload',
      );
    }
  });

  it('only lets through alerts that the app can tag and show', () => {
    const data = assertAlertsPayload(payload(alert(), alert({ id: 'BSA_2', headline: null, routes: [] })));
    expect(() => tagAlerts(net, data.alerts)).not.toThrow();
    for (const item of data.alerts) {
      expect(item.activePeriods.some((period) => period.start || period.end)).toBeTypeOf('boolean');
    }
  });
});
