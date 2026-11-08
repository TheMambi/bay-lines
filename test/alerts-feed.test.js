import { describe, expect, it } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { decodeAlertsFeed } from '../api/_lib/alerts-feed.js';
import { tagAlerts } from '../src/lib/alerts';
import { net } from '../src/lib/network';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const text = (t) => ({ translation: [{ text: t, language: 'en' }] });

function encode(message) {
  return FeedMessage.encode(FeedMessage.fromObject(message)).finish();
}

describe('decodeAlertsFeed', () => {
  const bytes = encode({
    header: { gtfsRealtimeVersion: '2.0', timestamp: 1794169068 },
    entity: [
      {
        id: 'BSA_1',
        alert: {
          headerText: text('Elevator out'),
          descriptionText: text('The street elevator at Lake Merritt is out of service.'),
          effect: 'ACCESSIBILITY_ISSUE',
          informedEntity: [{ stopId: 'A10-1' }, { routeId: '11' }],
          activePeriod: [{ start: 1794160000 }],
          url: text('http://www.bart.gov/schedules/advisories'),
        },
      },
    ],
  });

  it('turns the protobuf feed into the JSON the app reads', () => {
    const payload = decodeAlertsFeed(bytes);
    expect(payload.feedTimestamp).toBe(1794169068000);
    expect(payload.stale).toBe(false);
    expect(payload.alerts).toEqual([
      {
        id: 'BSA_1',
        headline: 'Elevator out',
        description: 'The street elevator at Lake Merritt is out of service.',
        effect: 'ACCESSIBILITY_ISSUE',
        routes: ['11'],
        stations: ['LAKE'],
        activePeriods: [{ start: 1794160000000, end: null }],
        url: 'http://www.bart.gov/schedules/advisories',
      },
    ]);
  });

  it('lets the app tag the alert to the Blue line and Lake Merritt', () => {
    const [tagged] = tagAlerts(net, decodeAlertsFeed(bytes).alerts);
    expect(tagged.lineIds).toEqual(['blue']);
    expect(tagged.stationIds).toEqual(['LAKE']);
    expect(tagged.tagged).toBe(true);
  });

  it('rejects bytes that are not a feed', () => {
    expect(() => decodeAlertsFeed(new Uint8Array([0xff, 0xff, 0xff]))).toThrow();
  });
});
