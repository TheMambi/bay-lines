import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clamp, easeInOutCubic, prefersReducedMotion } from '../lib/math';

export function usePanZoom(elRef, { content, minK = 0.35, maxK = 4.5, insets }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ k: 0.8, x: 0, y: 0 });
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const insetsRef = useRef(insets);
  const animRef = useRef(null);
  const draggedRef = useRef(false);
  const userMovedRef = useRef(false);
  insetsRef.current = insets;
  sizeRef.current = size;
  const commit = useCallback((next) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const cancelAnimation = () => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
    }
    animRef.current = null;
  };
  const visible = useCallback(() => {
    const { w, h } = sizeRef.current;
    const ins = insetsRef.current;
    return { l: ins.left, t: ins.top, r: w - ins.right, b: h - ins.bottom };
  }, []);
  const constrain = useCallback(
    (v) => {
      const vis = visible();
      const left = content.minX * v.k + v.x;
      const right = content.maxX * v.k + v.x;
      const top = content.minY * v.k + v.y;
      const bottom = content.maxY * v.k + v.y;
      let { x, y } = v;
      if (right < vis.l + 80) {
        x += vis.l + 80 - right;
      }
      if (left > vis.r - 80) {
        x -= left - (vis.r - 80);
      }
      if (bottom < vis.t + 80) {
        y += vis.t + 80 - bottom;
      }
      if (top > vis.b - 80) {
        y -= top - (vis.b - 80);
      }
      return { k: v.k, x, y };
    },
    [content, visible],
  );
  const animateTo = useCallback(
    (target, duration = 420, keepAutoFit = false) => {
      cancelAnimation();
      userMovedRef.current = !keepAutoFit;
      const dest = constrain({ ...target, k: clamp(target.k, minK, maxK) });
      if (prefersReducedMotion() || duration <= 0) {
        commit(dest);
        return;
      }
      const start = viewRef.current;
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / duration, 0, 1);
        const eased = easeInOutCubic(p);
        const k = Math.exp(Math.log(start.k) + (Math.log(dest.k) - Math.log(start.k)) * eased);
        commit({ k, x: start.x + (dest.x - start.x) * eased, y: start.y + (dest.y - start.y) * eased });
        animRef.current = p < 1 ? requestAnimationFrame(step) : null;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [commit, constrain, minK, maxK],
  );
  const viewFor = useCallback(
    (bounds, pad = 32, maxZoom = 1.6) => {
      const vis = visible();
      const padding = typeof pad == 'number' ? { l: pad, r: pad, t: pad, b: pad } : pad;
      const availW = Math.max(50, vis.r - vis.l - padding.l - padding.r);
      const availH = Math.max(50, vis.b - vis.t - padding.t - padding.b);
      const bw = bounds.maxX - bounds.minX;
      const bh = bounds.maxY - bounds.minY;
      const k = clamp(Math.min(availW / bw, availH / bh), minK, Math.min(maxK, maxZoom));
      return {
        k,
        x: vis.l + padding.l + (availW - bw * k) / 2 - bounds.minX * k,
        y: vis.t + padding.t + (availH - bh * k) / 2 - bounds.minY * k,
      };
    },
    [visible, minK, maxK],
  );
  const zoomAt = useCallback(
    (factor, at, animate = false) => {
      const cur = viewRef.current;
      const vis = visible();
      const anchor = at ?? { x: (vis.l + vis.r) / 2, y: (vis.t + vis.b) / 2 };
      const k = clamp(cur.k * factor, minK, maxK);
      const ratio = k / cur.k;
      userMovedRef.current = true;
      const next = { k, x: anchor.x - (anchor.x - cur.x) * ratio, y: anchor.y - (anchor.y - cur.y) * ratio };
      if (animate) {
        animateTo(next, 220);
      } else {
        cancelAnimation();
        commit(constrain(next));
      }
    },
    [animateTo, commit, constrain, visible, minK, maxK],
  );
  const panBy = useCallback(
    (dx, dy, animate = false) => {
      const cur = viewRef.current;
      userMovedRef.current = true;
      if (animate) {
        animateTo({ ...cur, x: cur.x + dx, y: cur.y + dy }, 160);
      } else {
        cancelAnimation();
        commit(constrain({ ...cur, x: cur.x + dx, y: cur.y + dy }));
      }
    },
    [animateTo, commit, constrain],
  );
  const centerOn = useCallback(
    (point, zoom, duration = 480) => {
      const vis = visible();
      const k = clamp(zoom ?? viewRef.current.k, minK, maxK);
      animateTo({ k, x: (vis.l + vis.r) / 2 - point.x * k, y: (vis.t + vis.b) / 2 - point.y * k }, duration);
    },
    [animateTo, visible, minK, maxK],
  );
  const ensureVisible = useCallback(
    (point, margin = 64, duration = 320) => {
      const { w, h } = sizeRef.current;
      if (!w || !h) {
        return;
      }
      const cur = viewRef.current;
      const vis = visible();
      const sx = point.x * cur.k + cur.x;
      const sy = point.y * cur.k + cur.y;
      let dx = 0;
      let dy = 0;
      if (sx < vis.l + margin) {
        dx = vis.l + margin - sx;
      } else if (sx > vis.r - margin) {
        dx = vis.r - margin - sx;
      }
      if (sy < vis.t + margin) {
        dy = vis.t + margin - sy;
      } else if (sy > vis.b - margin) {
        dy = vis.b - margin - sy;
      }
      if (dx || dy) {
        animateTo({ k: cur.k, x: cur.x + dx, y: cur.y + dy }, duration);
      }
    },
    [animateTo, visible],
  );
  const toWorld = useCallback(
    (screenX, screenY) => ({
      x: (screenX - viewRef.current.x) / viewRef.current.k,
      y: (screenY - viewRef.current.y) / viewRef.current.k,
    }),
    [],
  );
  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    const initial = el.getBoundingClientRect();
    setSize({ w: initial.width, h: initial.height });
    return () => observer.disconnect();
  }, [elRef]);
  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const pointers = new Map();
    let gesture = null;
    let downAt = null;
    const localPoint = (event) => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const snapshot = () => {
      const pts = [...pointers.values()];
      const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
      gesture = { pts: new Map(pointers), view: viewRef.current, dist, mid };
    };
    const onPointerDown = (event) => {
      if (event.pointerType !== 'mouse' || event.button === 0) {
        if (!event.target.closest('[data-map-control]')) {
          cancelAnimation();
          userMovedRef.current = true;
          pointers.set(event.pointerId, localPoint(event));
          if (pointers.size === 1) {
            draggedRef.current = false;
            downAt = localPoint(event);
          }
          if (pointers.size === 2) {
            draggedRef.current = true;
          }
          snapshot();
        }
      }
    };
    const onPointerMove = (event) => {
      if (!pointers.has(event.pointerId) || !gesture) {
        return;
      }
      pointers.set(event.pointerId, localPoint(event));
      const pts = [...pointers.values()];
      if (pts.length === 1) {
        const pt = pts[0];
        if (!draggedRef.current && downAt && Math.hypot(pt.x - downAt.x, pt.y - downAt.y) > 5) {
          draggedRef.current = true;
          try {
            el.setPointerCapture(event.pointerId);
          } catch {
            // Capture can fail if the pointer is already gone.
          }
        }
        if (draggedRef.current) {
          const mid = gesture.mid;
          commit(
            constrain({
              k: gesture.view.k,
              x: gesture.view.x + (pt.x - mid.x),
              y: gesture.view.y + (pt.y - mid.y),
            }),
          );
        }
      } else if (pts.length >= 2 && gesture.dist > 0) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const k = clamp(gesture.view.k * (dist / gesture.dist), minK, maxK);
        const ratio = k / gesture.view.k;
        commit(
          constrain({
            k,
            x: mid.x - (gesture.mid.x - gesture.view.x) * ratio,
            y: mid.y - (gesture.mid.y - gesture.view.y) * ratio,
          }),
        );
      }
    };
    const onPointerUp = (event) => {
      pointers.delete(event.pointerId);
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already be released.
      }
      if (pointers.size) {
        snapshot();
      } else {
        gesture = null;
      }
    };
    const onWheel = (event) => {
      if (event.target.closest('[data-map-control]')) {
        return;
      }
      event.preventDefault();
      userMovedRef.current = true;
      const at = localPoint(event);
      const unit = event.deltaMode === 1 ? 16 : 1;
      const delta = event.deltaY * unit;
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.012 : 0.0016));
      zoomAt(factor, at);
    };
    const onDoubleClick = (event) => {
      if (event.target.closest('[data-map-control],[data-station]')) {
        return;
      }
      const rect = el.getBoundingClientRect();
      zoomAt(1.8, { x: event.clientX - rect.left, y: event.clientY - rect.top }, true);
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDoubleClick);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [elRef, commit, constrain, zoomAt, minK, maxK]);
  const wasDragged = useCallback(() => draggedRef.current, []);
  const autoFit = useCallback(
    (bounds) => {
      if (!userMovedRef.current) {
        commit(constrain(viewFor(bounds)));
        userMovedRef.current = false;
      }
    },
    [commit, constrain, viewFor],
  );
  const fitAnimated = useCallback(
    (bounds, duration = 520) => {
      animateTo(viewFor(bounds), duration, true);
    },
    [animateTo, viewFor],
  );
  return useMemo(
    () => ({
      view,
      size,
      viewRef,
      animateTo,
      viewFor,
      zoomAt,
      panBy,
      centerOn,
      ensureVisible,
      toWorld,
      wasDragged,
      autoFit,
      fitAnimated,
      visible,
      commit,
    }),
    [
      view,
      size,
      animateTo,
      viewFor,
      zoomAt,
      panBy,
      centerOn,
      ensureVisible,
      toWorld,
      wasDragged,
      autoFit,
      fitAnimated,
      visible,
      commit,
    ],
  );
}
