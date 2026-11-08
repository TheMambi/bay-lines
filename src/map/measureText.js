let measureCtx = null;

const textWidthCache = new Map();

export function measureText(text, size, weight, family) {
  const key = `${weight}|${size}|${family}|${text}`;
  const cached = textWidthCache.get(key);
  if (cached != null) {
    return cached;
  }
  if (!measureCtx && typeof document < 'u') {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  let width;
  if (measureCtx) {
    measureCtx.font = `${weight} ${size}px ${family}`;
    width = measureCtx.measureText(text).width;
  } else {
    width = text.length * size * 0.56;
  }
  textWidthCache.set(key, width);
  return width;
}
