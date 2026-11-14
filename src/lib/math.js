export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const easeInOutCubic = (p) => {
  if (p < 0.5) {
    return 4 * p * p * p;
  }
  return 1 - (-2 * p + 2) ** 3 / 2;
};

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
