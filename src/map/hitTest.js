// Station hit circles keep their size on screen, so on a small or zoomed-out map they overlap and the
// browser reports whichever circle was drawn last. Among the circles that contain the point, the
// nearest center wins.
export function nearestStation(targets, point) {
  let best = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (distance <= target.r && distance < bestDistance) {
      best = target.id;
      bestDistance = distance;
    }
  }
  return best;
}
