const TIME_ZONE = 'America/Los_Angeles';

export const DAY_LABELS = { weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday / holiday' };

export const PERIOD_LABELS = { day: 'Before 9 pm', evening: '9 pm – close' };

export function serviceAt(date, overrides = {}) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value);
  const minutes = part('hour') * 60 + part('minute');
  let dayStart = Date.UTC(part('year'), part('month') - 1, part('day'));
  let period = minutes >= 1260 ? 'evening' : 'day';
  if (minutes < 240) {
    dayStart -= 86400000;
    period = 'evening';
  }
  const serviceDate = new Date(dayStart);
  const isoDate = serviceDate.toISOString().slice(0, 10);
  const weekday = serviceDate.getUTCDay();
  return {
    day: overrides[isoDate] ?? (weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday'),
    period,
  };
}

export function formatClock(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const hour = hours % 24;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function describeService(service) {
  return `${DAY_LABELS[service.day]} · ${PERIOD_LABELS[service.period].toLowerCase()}`;
}

export function minutesBetween(later, earlier) {
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(later) - toMinutes(earlier);
}

export function serviceMinuteNow(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value);
  const minutes = part('hour') * 60 + part('minute');
  if (minutes < 240) {
    return minutes + 1440;
  }
  return minutes;
}

export function formatMinute(minute) {
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function pacificDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
