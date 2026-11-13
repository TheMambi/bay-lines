export const ALERT_EFFECTS = {
  NO_SERVICE: 'No service',
  REDUCED_SERVICE: 'Reduced service',
  SIGNIFICANT_DELAYS: 'Significant delays',
  DETOUR: 'Detour',
  ADDITIONAL_SERVICE: 'Additional service',
  MODIFIED_SERVICE: 'Modified service',
  STOP_MOVED: 'Stop moved',
  ACCESSIBILITY_ISSUE: 'Accessibility issue',
};

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

const isAlert = (alert) =>
  !!alert &&
  typeof alert === 'object' &&
  typeof alert.id === 'string' &&
  typeof alert.description === 'string' &&
  (alert.headline == null || typeof alert.headline === 'string') &&
  isStringList(alert.routes) &&
  isStringList(alert.stations) &&
  Array.isArray(alert.activePeriods) &&
  alert.activePeriods.every((period) => !!period && typeof period === 'object');

// The app reads these fields while it renders, so one malformed alert rejects the whole payload and
// the caller shows its "alerts unavailable" state. Dropping only the bad alert could hide a closure.
export function assertAlertsPayload(data) {
  if (!data || !Array.isArray(data.alerts) || !data.alerts.every(isAlert)) {
    throw new Error('unexpected alerts payload');
  }
  return data;
}

export function tagAlerts(net, alerts) {
  const lineByRoute = new Map();
  for (const line of net.lines) {
    for (const gtfsRouteId of line.gtfsRouteIds) {
      lineByRoute.set(gtfsRouteId, line.id);
    }
  }
  return alerts.map((alert) => ({
    alert,
    lineIds: [
      ...new Set(
        alert.routes
          .map(
            (route) =>
              lineByRoute.get(route) ??
              (net.lineById.has(route.toLowerCase()) ? route.toLowerCase() : undefined),
          )
          .filter((id) => !!id),
      ),
    ],
    stationIds: alert.stations.filter((station) => net.stationById.has(station)),
    tagged: alert.routes.length > 0 || alert.stations.length > 0,
  }));
}
