import { describe, expect, it } from 'vitest';
import { net } from '../src/lib/network';
import { searchStations } from '../src/lib/search';
import { formatFare, plural, safeBartUrl } from '../src/lib/format';

describe('searchStations', () => {
  it('matches codes, names and common nicknames', () => {
    expect(searchStations(net, 'sfo')[0].station.id).toBe('SFIA');
    expect(searchStations(net, 'embarc')[0].station.id).toBe('EMBR');
    expect(searchStations(net, 'oakland airport')[0].station.id).toBe('OAKL');
    expect(searchStations(net, 'ferry building')[0].station.id).toBe('EMBR');
  });

  it('returns nothing for empty or unmatched input', () => {
    expect(searchStations(net, '   ')).toEqual([]);
    expect(searchStations(net, 'zzzz')).toEqual([]);
  });
});

describe('format helpers', () => {
  it('formats fares and plurals', () => {
    expect(formatFare(425)).toBe('$4.25');
    expect(formatFare(null)).toBe('—');
    expect(plural(1, 'stop')).toBe('1 stop');
    expect(plural(3, 'stop')).toBe('3 stops');
  });

  it('only lets bart.gov links through, upgraded to https', () => {
    expect(safeBartUrl('http://www.bart.gov/schedules/advisories')).toBe(
      'https://www.bart.gov/schedules/advisories',
    );
    expect(safeBartUrl('https://bart.gov/x')).toBe('https://bart.gov/x');
    expect(safeBartUrl('https://example.com/x')).toBeUndefined();
    expect(safeBartUrl('https://bart.gov.example.com/x')).toBeUndefined();
    expect(safeBartUrl('https://notbart.gov/x')).toBeUndefined();
    expect(safeBartUrl('https://user:pw@www.bart.gov/x')).toBeUndefined();
    expect(safeBartUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeBartUrl('not a url')).toBeUndefined();
    expect(safeBartUrl(null)).toBeUndefined();
  });
});
