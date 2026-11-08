export const formatFare = (cents) => {
  if (cents == null) {
    return '—';
  }
  return `$${(cents / 100).toFixed(2)}`;
};

export const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const DISPLAY_TIME_ZONE = 'America/Los_Angeles';

export function formatTime(receivedAt) {
  return new Date(receivedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'short',
  });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'short',
  });
}

export function safeBartUrl(url) {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' && /(^|\.)bart\.gov$/i.test(parsed.hostname)) {
        parsed.protocol = 'https:';
      }
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return undefined;
    } catch {
      return;
    }
  }
}

export function timeAgo(receivedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - receivedAt) / 1000));
  if (seconds < 45) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  return `${Math.round(minutes / 60)} h ago`;
}
