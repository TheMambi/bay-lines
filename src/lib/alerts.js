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
