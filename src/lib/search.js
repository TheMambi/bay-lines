const STATION_ALIASES = {
  SFIA: ['SFO', 'San Francisco Airport', 'San Francisco International', 'airport'],
  OAKL: ['OAK', 'Oakland Airport', 'Oakland International', 'airport'],
  '12TH': ['Oakland City Center', 'Downtown Oakland', '12th St'],
  '19TH': ['Downtown Oakland', '19th St'],
  CIVC: ['UN Plaza', 'Civic Center'],
  '16TH': ['16th and Mission', '16th St', 'Mission'],
  '24TH': ['24th and Mission', '24th St', 'Mission'],
  POWL: ['Powell', 'Union Square'],
  MONT: ['Montgomery', 'Financial District'],
  EMBR: ['Ferry Building', 'Embarcadero Center'],
  BERY: ['Berryessa', 'North San Jose', 'San Jose'],
  MLPT: ['Milpitas'],
  WARM: ['Warm Springs', 'South Fremont'],
  PITT: ['Bay Point', 'Pittsburg'],
  PCTR: ['Pittsburg', 'eBART'],
  ANTC: ['eBART'],
  PHIL: ['Pleasant Hill', 'Contra Costa Centre'],
  NCON: ['North Concord', 'Martinez'],
  DUBL: ['Dublin', 'Pleasanton'],
  WDUB: ['West Dublin', 'Pleasanton'],
  DELN: ['El Cerrito del Norte'],
  DBRK: ['Berkeley'],
  NBRK: ['Berkeley'],
  COLS: ['Oakland Coliseum', 'Oakland Arena'],
  SSAN: ['South SF'],
  DALY: ['Daly'],
  MLBR: ['Caltrain'],
  BAYF: ['Bayfair'],
  MCAR: ['Mac Arthur'],
};

// Words people add that are part of no station name.
const FILLER_WORDS = new Set(['station', 'stn', 'bart']);

const normalizeName = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bsaint\b/g, 'st')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function searchStations(net, query, limit = 8) {
  const words = normalizeName(query)
    .split(' ')
    .filter((word) => word && !FILLER_WORDS.has(word));
  const q = words.join(' ');
  if (!q) {
    return [];
  }
  const matches = [];
  for (const station of net.stations) {
    const name = normalizeName(station.name);
    const nameWords = name.split(' ');
    let score = 0;
    let matchedOn;
    if (name.startsWith(q)) {
      score = 100 - name.length * 0.1;
    } else if (words.every((word) => nameWords.some((part) => part.startsWith(word)))) {
      score = 80 - name.length * 0.1;
    } else if (name.includes(q)) {
      score = 60 - name.length * 0.1;
    }
    if (station.id.toLowerCase() === q) {
      score = Math.max(score, 95);
      matchedOn = station.id;
    }
    for (const alias of STATION_ALIASES[station.id] ?? []) {
      const norm = normalizeName(alias);
      let aliasScore = 0;
      if (norm === q) {
        aliasScore = 92;
      } else if (norm.startsWith(q)) {
        aliasScore = 70;
      } else if (words.every((word) => norm.split(' ').some((part) => part.startsWith(word)))) {
        aliasScore = 55;
      }
      if (aliasScore > score) {
        score = aliasScore;
        matchedOn = alias;
      }
    }
    if (score === 0) {
      // Last resort: every word starts some word of the name, a nickname or the code ("sfo airport").
      const known = [station.name, station.id, ...(STATION_ALIASES[station.id] ?? [])].flatMap((text) =>
        normalizeName(text).split(' '),
      );
      if (words.every((word) => known.some((part) => part.startsWith(word)))) {
        score = 40 - name.length * 0.1;
      }
    }
    if (score > 0) {
      matches.push({
        station,
        matchedOn: score > 0 && normalizeName(station.name).includes(q) ? undefined : matchedOn,
        score,
      });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.station.name.localeCompare(b.station.name));
  return matches.slice(0, limit);
}
