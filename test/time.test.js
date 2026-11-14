import { describe, expect, it } from 'vitest';
import { formatClock, formatMinute, pacificDate, serviceAt, serviceMinuteNow } from '../src/lib/time';

// 2026-11-09 is a Monday. Pacific time is UTC-8 in November.
const pacific = (iso) => new Date(`${iso}-08:00`);

describe('serviceAt', () => {
  it('maps the Pacific clock to a service day and period', () => {
    expect(serviceAt(pacific('2026-11-09T10:00'))).toEqual({ day: 'weekday', period: 'day' });
    expect(serviceAt(pacific('2026-11-09T21:30'))).toEqual({ day: 'weekday', period: 'evening' });
    expect(serviceAt(pacific('2026-11-14T12:00'))).toEqual({ day: 'saturday', period: 'day' });
  });

  it('treats the small hours as the previous service day', () => {
    expect(serviceAt(pacific('2026-11-15T02:00'))).toEqual({ day: 'saturday', period: 'evening' });
  });

  it('applies holiday overrides', () => {
    expect(serviceAt(pacific('2026-11-26T12:00'), { '2026-11-26': 'sunday' }).day).toBe('sunday');
  });
});

describe('clock helpers', () => {
  it('formats schedule times', () => {
    expect(formatClock('13:05')).toBe('1:05 PM');
    expect(formatClock('24:30')).toBe('12:30 AM');
    expect(formatMinute(1500)).toBe('1:00 AM');
  });

  it('counts minutes after midnight past 24:00 for late service', () => {
    expect(serviceMinuteNow(pacific('2026-11-10T01:00'))).toBe(25 * 60);
  });
});

describe('pacificDate', () => {
  it('gives the calendar date in California, not in UTC', () => {
    expect(pacificDate(new Date('2027-01-11T07:59:00Z'))).toBe('2027-01-10');
    expect(pacificDate(new Date('2027-01-11T08:00:00Z'))).toBe('2027-01-11');
    expect(pacificDate(new Date('2026-07-04T06:59:00Z'))).toBe('2026-07-03');
  });
});
