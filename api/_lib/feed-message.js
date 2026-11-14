// Reads the parts of a GTFS-Realtime FeedMessage that the alerts proxy uses. Field numbers
// and effect names follow gtfs-realtime.proto from the GTFS-Realtime specification
// (https://gtfs.org/documentation/realtime/proto/). Every other field is skipped unread.

const VARINT = 0;
const FIXED64 = 1;
const BYTES = 2;
const FIXED32 = 5;

const EFFECTS = [
  null,
  'NO_SERVICE',
  'REDUCED_SERVICE',
  'SIGNIFICANT_DELAYS',
  'DETOUR',
  'ADDITIONAL_SERVICE',
  'MODIFIED_SERVICE',
  'OTHER_EFFECT',
  'UNKNOWN_EFFECT',
  'STOP_MOVED',
  'NO_EFFECT',
  'ACCESSIBILITY_ISSUE',
];

const utf8 = new TextDecoder();

// Values past 2^53 lose precision. The feed's only numbers are Unix times and small enums.
function readVarint(bytes, cursor, end) {
  let value = 0;
  for (let scale = 1, count = 0; count < 10; scale *= 128, count += 1) {
    if (cursor.at >= end) throw new Error('feed ends inside a number');
    const byte = bytes[cursor.at++];
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return value;
  }
  throw new Error('feed has a number longer than ten bytes');
}

const number = (value) => value;
const flag = (value) => value !== 0;
const effect = (value) => EFFECTS[value] ?? null;
const string = (bytes, start, end) => utf8.decode(bytes.subarray(start, end));

// fields: { [field number]: [name, wire type, reader, repeated] }. A field that arrives with
// another wire type is skipped like an unknown one.
const message = (fields, required = []) =>
  function read(bytes, start, end) {
    const out = {};
    const cursor = { at: start };
    while (cursor.at < end) {
      const tag = readVarint(bytes, cursor, end);
      const wireType = tag % 8;
      const [name, expected, reader, repeated] = fields[Math.floor(tag / 8)] ?? [];
      const wanted = expected === wireType;
      if (wireType === VARINT) {
        const value = readVarint(bytes, cursor, end);
        if (wanted) out[name] = reader(value);
      } else if (wireType === BYTES) {
        const length = readVarint(bytes, cursor, end);
        const from = cursor.at;
        cursor.at += length;
        if (cursor.at > end) throw new Error('feed ends inside a field');
        if (wanted) {
          const value = reader(bytes, from, cursor.at);
          if (repeated) (out[name] ??= []).push(value);
          else out[name] = value;
        }
      } else if (wireType === FIXED64 || wireType === FIXED32) {
        cursor.at += wireType === FIXED64 ? 8 : 4;
        if (cursor.at > end) throw new Error('feed ends inside a field');
      } else {
        throw new Error(`feed has an unsupported wire type ${wireType}`);
      }
    }
    for (const field of required) {
      if (out[field] === undefined) throw new Error(`feed is missing required '${field}'`);
    }
    return out;
  };

const timeRange = message({ 1: ['start', VARINT, number], 2: ['end', VARINT, number] });
const entitySelector = message({ 2: ['routeId', BYTES, string], 5: ['stopId', BYTES, string] });
const translation = message({ 1: ['text', BYTES, string], 2: ['language', BYTES, string] }, ['text']);
const translatedString = message({ 1: ['translation', BYTES, translation, true] });
const alert = message({
  1: ['activePeriod', BYTES, timeRange, true],
  5: ['informedEntity', BYTES, entitySelector, true],
  7: ['effect', VARINT, effect],
  8: ['url', BYTES, translatedString],
  10: ['headerText', BYTES, translatedString],
  11: ['descriptionText', BYTES, translatedString],
});
const feedEntity = message(
  { 1: ['id', BYTES, string], 2: ['isDeleted', VARINT, flag], 5: ['alert', BYTES, alert] },
  ['id'],
);
const feedHeader = message({ 1: ['gtfsRealtimeVersion', BYTES, string], 3: ['timestamp', VARINT, number] }, [
  'gtfsRealtimeVersion',
]);
const feedMessage = message({ 1: ['header', BYTES, feedHeader], 2: ['entity', BYTES, feedEntity, true] }, [
  'header',
]);

/** Throws if the bytes are not a FeedMessage with its required fields. */
export const decodeFeedMessage = (bytes) => feedMessage(bytes, 0, bytes.length);
