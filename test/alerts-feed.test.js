import { describe, expect, it } from 'vitest';
import { decodeAlertsFeed } from '../api/_lib/alerts-feed.js';
import { tagAlerts } from '../src/lib/alerts';
import { net } from '../src/lib/network';
import { EFFECT_NAMES, HEADER, encodeFeed, text } from './feed.js';

describe('decodeAlertsFeed', () => {
  const bytes = encodeFeed({
    header: HEADER,
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

  it('rejects an empty answer instead of reading it as "no alerts"', () => {
    expect(() => decodeAlertsFeed(new Uint8Array(0))).toThrow(/header/);
  });

  it('rejects a feed that is cut off or lacks a required field', () => {
    const header = encodeFeed({ header: HEADER });
    const withBytes = (...extra) => new Uint8Array([...header, ...extra]);
    expect(decodeAlertsFeed(header).alerts).toEqual([]);
    // An entity that claims 127 bytes when none follow, then one with no id.
    expect(() => decodeAlertsFeed(withBytes(0x12, 0x7f))).toThrow(/ends inside/);
    expect(() => decodeAlertsFeed(withBytes(0x12, 0x00))).toThrow(/'id'/);
    expect(() => decodeAlertsFeed(bytes.subarray(0, bytes.length - 3))).toThrow();
    // Group wire types do not occur in GTFS-Realtime.
    expect(() => decodeAlertsFeed(withBytes(0x1b))).toThrow(/wire type/);
  });

  it('skips the fields and entities it does not use', () => {
    const payload = decodeAlertsFeed(
      encodeFeed({
        header: { ...HEADER, incrementality: 0 },
        entity: [
          { id: 'V1', vehicle: { position: { latitude: 37.8, longitude: -122.27 }, odometer: 12345 } },
          { id: 'GONE', isDeleted: true, alert: { headerText: text('Withdrawn') } },
          {
            id: 'BSA_2',
            alert: {
              cause: 3,
              severityLevel: 2,
              ttsHeaderText: text('Spoken headline'),
              headerText: { translation: [{ text: 'Retraso', language: 'es' }, { text: 'Delay' }] },
              informedEntity: [
                { agencyId: 'BART', routeId: '1', routeType: 1, directionId: 1 },
                { routeId: '1' },
                { stopId: 'm16-2' },
              ],
              activePeriod: [{ start: 1794160000, end: 1794163600 }, {}],
            },
          },
        ],
      }),
    );
    expect(payload.alerts).toEqual([
      {
        id: 'BSA_2',
        headline: 'Delay',
        description: '',
        effect: null,
        routes: ['1'],
        stations: ['EMBR'],
        activePeriods: [
          { start: 1794160000000, end: 1794163600000 },
          { start: null, end: null },
        ],
        url: null,
      },
    ]);
  });

  it('names every effect in the specification', () => {
    expect(EFFECT_NAMES).toHaveLength(11);
    const { alerts } = decodeAlertsFeed(
      encodeFeed({
        header: HEADER,
        entity: EFFECT_NAMES.map((effect, i) => ({ id: `E${i}`, alert: { effect } })),
      }),
    );
    expect(alerts.map((a) => a.effect)).toEqual(EFFECT_NAMES);
  });
});
