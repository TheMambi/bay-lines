import protobuf from 'protobufjs';

// The alert messages of gtfs-realtime.proto (https://gtfs.org/documentation/realtime/proto/),
// encoded by an independent library so the tests check api/_lib/feed-message.js against it.
// It lists more fields than the function reads, to prove the rest are skipped.
const { root } = protobuf.parse(`
  syntax = "proto2";
  package transit_realtime;
  message FeedMessage { required FeedHeader header = 1; repeated FeedEntity entity = 2; }
  message FeedHeader {
    required string gtfs_realtime_version = 1;
    optional int32 incrementality = 2;
    optional uint64 timestamp = 3;
  }
  message FeedEntity {
    required string id = 1;
    optional bool is_deleted = 2;
    optional VehiclePosition vehicle = 4;
    optional Alert alert = 5;
  }
  message VehiclePosition { optional Position position = 2; optional fixed64 odometer = 99; }
  message Position { required float latitude = 1; required float longitude = 2; }
  message Alert {
    repeated TimeRange active_period = 1;
    repeated EntitySelector informed_entity = 5;
    optional int32 cause = 6;
    optional Effect effect = 7;
    optional TranslatedString url = 8;
    optional TranslatedString header_text = 10;
    optional TranslatedString description_text = 11;
    optional TranslatedString tts_header_text = 12;
    optional int32 severity_level = 14;
    enum Effect {
      NO_SERVICE = 1; REDUCED_SERVICE = 2; SIGNIFICANT_DELAYS = 3; DETOUR = 4;
      ADDITIONAL_SERVICE = 5; MODIFIED_SERVICE = 6; OTHER_EFFECT = 7; UNKNOWN_EFFECT = 8;
      STOP_MOVED = 9; NO_EFFECT = 10; ACCESSIBILITY_ISSUE = 11;
    }
  }
  message TimeRange { optional uint64 start = 1; optional uint64 end = 2; }
  message EntitySelector {
    optional string agency_id = 1;
    optional string route_id = 2;
    optional int32 route_type = 3;
    optional string stop_id = 5;
    optional uint32 direction_id = 6;
  }
  message TranslatedString {
    repeated Translation translation = 1;
    message Translation { required string text = 1; optional string language = 2; }
  }
`);

export const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
export const EFFECT_NAMES = Object.keys(root.lookupEnum('transit_realtime.Alert.Effect').values);

export const text = (t) => ({ translation: [{ text: t, language: 'en' }] });

export const HEADER = { gtfsRealtimeVersion: '2.0', timestamp: 1794169068 };

export const encodeFeed = (message) => FeedMessage.encode(FeedMessage.fromObject(message)).finish();
