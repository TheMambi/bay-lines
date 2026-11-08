export const BENDS = {};

export const CORRIDORS = [
  ['RICH', 'DELN', 'PLZA', 'NBRK', 'DBRK', 'ASHB', 'MCAR', '19TH', '12TH'],
  ['ANTC', 'PCTR', 'PITT', 'NCON', 'CONC', 'PHIL', 'WCRK', 'LAFY', 'ORIN', 'ROCK', 'MCAR'],
  ['12TH', 'WOAK'],
  ['BERY', 'MLPT', 'WARM', 'FRMT', 'UCTY', 'SHAY', 'HAYW', 'BAYF', 'SANL', 'COLS', 'FTVL', 'LAKE', '12TH'],
  ['LAKE', 'WOAK'],
  ['DUBL', 'WDUB', 'CAST', 'BAYF'],
  ['OAKL', 'COLS'],
  [
    'WOAK',
    'EMBR',
    'MONT',
    'POWL',
    'CIVC',
    '16TH',
    '24TH',
    'GLEN',
    'BALB',
    'DALY',
    'COLM',
    'SSAN',
    'SBRN',
    'SFIA',
    'MLBR',
  ],
];

export const LINE_ORDER = ['green', 'blue', 'yellow', 'orange', 'red', 'grey'];

export const STATION_LAYOUT = {
  EMBR: { x: 48, y: 44, label: 'Embarcadero', anchor: 'ne', rank: 2 },
  MONT: { x: 45, y: 47, label: 'Montgomery St', anchor: 'w', rank: 3 },
  POWL: { x: 42, y: 50, label: 'Powell St', anchor: 'w', rank: 3 },
  CIVC: { x: 39, y: 53, label: 'Civic Center / UN Plaza', anchor: 'w', rank: 3 },
  '16TH': { x: 39, y: 57, label: '16th St Mission', anchor: 'w', rank: 3 },
  '24TH': { x: 39, y: 61, label: '24th St Mission', anchor: 'w', rank: 3 },
  GLEN: { x: 39, y: 65, label: 'Glen Park', anchor: 'w', rank: 3 },
  BALB: { x: 39, y: 69, label: 'Balboa Park', anchor: 'w', rank: 3 },
  DALY: { x: 39, y: 73, label: 'Daly City', anchor: 'w', rank: 1 },
  COLM: { x: 39, y: 77, label: 'Colma', anchor: 'w', rank: 3 },
  SSAN: { x: 42, y: 80, label: 'South San Francisco', anchor: 'w', rank: 3 },
  SBRN: { x: 45, y: 83, label: 'San Bruno', anchor: 'w', rank: 3 },
  SFIA: { x: 48, y: 86, label: 'SFO Airport', anchor: 'w', rank: 1, gap: 14 },
  MLBR: { x: 48, y: 90, label: 'Millbrae', anchor: 'e', rank: 1, badge: 'sw' },
  WOAK: { x: 67, y: 44, label: 'West Oakland', anchor: 'nw', rank: 1 },
  '12TH': { x: 76, y: 44, label: '12th St / City Center', anchor: 'ne', rank: 1 },
  '19TH': { x: 76, y: 40, label: '19th St Oakland', anchor: 'ne', rank: 2 },
  MCAR: { x: 76, y: 36, label: 'MacArthur', anchor: 'nw', rank: 1 },
  LAKE: { x: 76, y: 53, label: 'Lake Merritt', anchor: 'sw', rank: 1 },
  ASHB: { x: 76, y: 32, label: 'Ashby', anchor: 'w', rank: 3 },
  DBRK: { x: 76, y: 28, label: 'Downtown Berkeley', anchor: 'w', rank: 2 },
  NBRK: { x: 76, y: 24, label: 'North Berkeley', anchor: 'w', rank: 3 },
  PLZA: { x: 73, y: 21, label: 'El Cerrito Plaza', anchor: 'w', rank: 3 },
  DELN: { x: 70, y: 18, label: 'El Cerrito del Norte', anchor: 'w', rank: 3 },
  RICH: { x: 70, y: 14, label: 'Richmond', anchor: 'w', rank: 1 },
  ROCK: { x: 79, y: 33, label: 'Rockridge', anchor: 'e', rank: 3 },
  ORIN: { x: 82, y: 30, label: 'Orinda', anchor: 'n', rank: 3 },
  LAFY: { x: 86, y: 30, label: 'Lafayette', anchor: 's', rank: 3 },
  WCRK: { x: 90, y: 30, label: 'Walnut Creek', anchor: 'e', rank: 2 },
  PHIL: { x: 90, y: 26, label: 'Pleasant Hill', anchor: 'e', rank: 3 },
  CONC: { x: 90, y: 22, label: 'Concord', anchor: 'e', rank: 2 },
  NCON: { x: 90, y: 18, label: 'North Concord / Martinez', anchor: 'e', rank: 3 },
  PITT: { x: 93, y: 15, label: 'Pittsburg / Bay Point', anchor: 'n', rank: 1 },
  PCTR: { x: 101, y: 15, label: 'Pittsburg Center', anchor: 'n', rank: 3 },
  ANTC: { x: 108, y: 15, label: 'Antioch', anchor: 'n', rank: 1 },
  FTVL: { x: 79, y: 56, label: 'Fruitvale', anchor: 'sw', rank: 3 },
  COLS: { x: 82, y: 59, label: 'Coliseum', anchor: 'sw', rank: 1 },
  OAKL: { x: 76, y: 65, label: 'Oakland Airport (OAK)', anchor: 'w', rank: 1, badge: 's' },
  SANL: { x: 85, y: 62, label: 'San Leandro', anchor: 'sw', rank: 3 },
  BAYF: { x: 88, y: 65, label: 'Bay Fair', anchor: 'sw', rank: 1 },
  HAYW: { x: 91, y: 68, label: 'Hayward', anchor: 'sw', rank: 2 },
  SHAY: { x: 94, y: 71, label: 'South Hayward', anchor: 'sw', rank: 3 },
  UCTY: { x: 97, y: 74, label: 'Union City', anchor: 'sw', rank: 2 },
  FRMT: { x: 100, y: 77, label: 'Fremont', anchor: 'w', rank: 2 },
  WARM: { x: 100, y: 81, label: 'Warm Springs / S. Fremont', anchor: 'w', rank: 3 },
  MLPT: { x: 100, y: 85, label: 'Milpitas', anchor: 'w', rank: 3 },
  BERY: { x: 100, y: 89, label: 'Berryessa / N. San Jose', anchor: 'w', rank: 1 },
  CAST: { x: 95, y: 65, label: 'Castro Valley', anchor: 'n', rank: 3 },
  WDUB: { x: 109, y: 65, label: 'West Dublin / Pleasanton', anchor: 'n', rank: 3 },
  DUBL: { x: 114, y: 65, label: 'Dublin / Pleasanton', anchor: 'n', rank: 1 },
};

export const TRACK_FEATURES = [
  {
    id: 'ebart-transfer-platform',
    between: ['PITT', 'PCTR'],
    at: 0.5,
    label: 'Transfer Platform',
    note: 'Riders change trains here between BART and the eBART (diesel multiple unit) trains to Pittsburg Center and Antioch. The platform can only be reached by train.',
    source: 'https://www.bart.gov/stations/pctr',
  },
];

export const AREA_LABELS = [
  { text: 'San Francisco Bay', x: 58, y: 66, rotate: -62, kind: 'water' },
  { text: 'San Pablo Bay', x: 55, y: 15, kind: 'water' },
  { text: 'Pacific Ocean', x: 22, y: 68, rotate: -90, kind: 'water' },
];

export const LANE_GAP = 6.6;

export const LANE_WIDTH = 5.2;

export const CASING_WIDTH = 1.35;
