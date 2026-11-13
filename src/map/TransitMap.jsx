import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePanZoom } from '../hooks/usePanZoom';
import { reachBand } from '../lib/reach';
import { TrainsLayer } from './TrainsLayer';
import { buildGeometry } from './geometry';
import { nearestStation } from './hitTest';
import {
  LABEL_FONT,
  boxHitsSegment,
  boxesOverlap,
  circleHitsBox,
  circleHitsSegment,
  endOfLineBadges,
  layoutLabels,
  nearestCompass,
  placeLabel,
} from './labels';
import {
  AreaLabels,
  GeographyLayer,
  LinesLayer,
  PinGlyph,
  ReachLayer,
  StationLabel,
  StationMarker,
  TrackFeatures,
} from './layers';
import { measureText } from './measureText';
import { AREA_LABELS, CASING_WIDTH, LANE_GAP, LANE_WIDTH, STATION_LAYOUT } from './schematic';

const FIT_PADDING = { left: 190, right: 110, top: 70, bottom: 80 };

const FIT_PADDING_COMPACT = { left: 120, right: 80, top: 50, bottom: 50 };

export const TransitMap = memo(
  forwardRef(function (
    {
      net,
      geography,
      service,
      selected,
      from,
      to,
      highlightLine,
      itinerary,
      pickMode,
      reach,
      replay,
      game,
      insets,
      onStationClick,
      onLineClick,
      onBackgroundClick,
    },
    ref,
  ) {
    const surfaceRef = useRef(null);
    const [surfaceWidth, setSurfaceWidth] = useState(0);
    const geometry = useMemo(() => buildGeometry(net), [net]);
    const endBadges = useMemo(() => endOfLineBadges(net), [net]);
    const reachSet = useMemo(() => {
      if (!reach) {
        return null;
      }
      const set = new Set([reach.origin]);
      if (reach.origin2) {
        set.add(reach.origin2);
      }
      for (const [stationId, entry] of reach.stops) {
        if (entry.minutes <= reach.horizon) {
          set.add(stationId);
        }
      }
      return set;
    }, [reach]);
    const pointA = reach ? (reach.origin2 ? reach.origin : null) : from;
    const pointB = reach ? (reach.origin2 ?? null) : to;
    const focus = useMemo(
      () => ({ lineId: highlightLine, itinerary, reach: reachSet }),
      [highlightLine, itinerary, reachSet],
    );
    const marks = game?.marks;
    const hideNames = !!game?.hideNames;
    const compact = surfaceWidth > 0 && surfaceWidth < 640;
    const fitBounds = useMemo(() => {
      const b = geometry.bounds;
      const pad = compact ? FIT_PADDING_COMPACT : FIT_PADDING;
      return {
        minX: b.minX - pad.left,
        maxX: b.maxX + pad.right,
        minY: b.minY - pad.top,
        maxY: b.maxY + pad.bottom,
      };
    }, [geometry, compact]);
    const panZoom = usePanZoom(surfaceRef, {
      content: useMemo(() => {
        const b = geometry.bounds;
        const extent = geography?.extent;
        const box = { minX: b.minX - 420, maxX: b.maxX + 420, minY: b.minY - 420, maxY: b.maxY + 420 };
        if (extent) {
          return {
            minX: Math.max(box.minX, extent.minX + 200),
            maxX: Math.min(box.maxX, extent.maxX - 200),
            minY: Math.max(box.minY, extent.minY + 200),
            maxY: Math.min(box.maxY, extent.maxY - 200),
          };
        }
        return box;
      }, [geometry, geography]),
      insets,
      minK: 0.26,
      maxK: 4,
    });
    const { view, size } = panZoom;
    useEffect(() => setSurfaceWidth(size.w), [size.w]);
    useEffect(() => {
      if (size.w > 0 && size.h > 0) {
        panZoom.autoFit(fitBounds);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-fit on resize only; panZoom changes on every pan and would undo the user’s view.
    }, [size.w, size.h, insets.top, insets.right, insets.bottom, insets.left, fitBounds]);
    const [fontEpoch, setFontEpoch] = useState(0);
    useEffect(() => {
      let alive = true;
      document.fonts?.ready.then(() => alive && setFontEpoch((n) => n + 1));
      return () => {
        alive = false;
      };
    }, []);
    const [blockers, setBlockers] = useState([]);
    useEffect(() => {
      const el = surfaceRef.current;
      const parent = el?.parentElement;
      if (!el || !parent) {
        return;
      }
      const measure = () => {
        const origin = el.getBoundingClientRect();
        const boxes = [];
        parent.parentElement?.querySelectorAll('[data-map-blocker]').forEach((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width && rect.height) {
            boxes.push({
              x0: rect.left - origin.left - 4,
              y0: rect.top - origin.top - 4,
              x1: rect.right - origin.left + 4,
              y1: rect.bottom - origin.top + 4,
            });
          }
        });
        setBlockers((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(boxes)) {
            return prev;
          }
          return boxes;
        });
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(document.body);
      parent.parentElement?.querySelectorAll('[data-map-blocker]').forEach((node) => observer.observe(node));
      return () => observer.disconnect();
    }, [size.w, size.h, insets]);
    const [hovered, setHovered] = useState(null);
    const [focused, setFocused] = useState(null);
    const [tabStop, setTabStop] = useState(net.stations[0].id);
    const pos = geometry.pos;
    const tripStations = useMemo(() => {
      const all = new Set();
      const changes = new Set();
      if (itinerary) {
        itinerary.legs.forEach((leg, index) => {
          leg.stops.forEach((stop) => all.add(stop));
          if (index > 0) {
            changes.add(leg.from);
          }
        });
      }
      return { all, changes };
    }, [itinerary]);
    useImperativeHandle(
      ref,
      () => ({
        fit: () => panZoom.fitAnimated(fitBounds, 520),
        zoomIn: () => panZoom.zoomAt(1.5, undefined, true),
        zoomOut: () => panZoom.zoomAt(1 / 1.5, undefined, true),
        focusStation: (stationId, opts) =>
          panZoom.centerOn(
            pos(stationId),
            opts?.zoom === false ? undefined : Math.max(panZoom.viewRef.current.k, 1.35),
          ),
        ensureStationVisible: (stationId) => panZoom.ensureVisible(pos(stationId), 90),
        showStations: (ids) => {
          if (!ids.length) {
            return;
          }
          const pts = ids.map((id) => ({ id, ...pos(id) }));
          const minX = Math.min(...pts.map((p) => p.x));
          const maxX = Math.max(...pts.map((p) => p.x));
          const bounds = {
            minX,
            maxX,
            minY: Math.min(...pts.map((p) => p.y)),
            maxY: Math.max(...pts.map((p) => p.y)),
          };
          const labelReach = (side, x) => {
            let reachPx = 0;
            for (const p of pts) {
              const layout = STATION_LAYOUT[p.id];
              if (Math.abs(p.x - x) > 1 || !layout) {
                continue;
              }
              const width = measureText(layout.label, 14, 750, LABEL_FONT);
              if (layout.anchor.includes(side)) {
                reachPx = Math.max(reachPx, width + 26);
              } else if (layout.anchor === 'n' || layout.anchor === 's') {
                reachPx = Math.max(reachPx, width / 2 + 8);
              }
            }
            return reachPx;
          };
          const pad = {
            l: Math.max(70, labelReach('w', minX) + 16),
            r: Math.max(70, labelReach('e', maxX) + 16),
            t: 84,
            b: 84,
          };
          panZoom.animateTo(panZoom.viewFor(bounds, pad, 1.7), 620);
        },
        focusMap: () => surfaceRef.current?.focus(),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the specific panZoom methods used are listed; the object itself changes on every pan.
      [
        panZoom.viewFor,
        panZoom.animateTo,
        panZoom.fitAnimated,
        panZoom.zoomAt,
        panZoom.centerOn,
        panZoom.ensureVisible,
        fitBounds,
        pos,
      ],
    );
    const tripLines = useMemo(() => new Set(itinerary?.legs.map((leg) => leg.lineId) ?? []), [itinerary]);
    const isDimmed = useCallback(
      (stationId, lineId) => {
        if (reachSet) {
          return !reachSet.has(stationId);
        }
        if (itinerary) {
          return !(tripLines.has(lineId) && tripStations.all.has(stationId));
        }
        return !!highlightLine && highlightLine !== lineId;
      },
      [reachSet, itinerary, tripLines, tripStations, highlightLine],
    );
    const zoom = view.k;
    const toScreen = useCallback(
      (p) => ({ x: p.x * zoom + view.x, y: p.y * zoom + view.y }),
      [zoom, view.x, view.y],
    );
    const markerExtent = useCallback(
      (stationId, axis) => {
        const symbol = geometry.symbols.get(stationId);
        const rad = (symbol.angle * Math.PI) / 180;
        const half = symbol.half;
        const thick = symbol.thick;
        const ex =
          symbol.kind === 'dot' || symbol.kind === 'disc'
            ? half
            : Math.abs(Math.cos(rad)) * half + Math.abs(Math.sin(rad)) * thick;
        const ey =
          symbol.kind === 'dot' || symbol.kind === 'disc'
            ? half
            : Math.abs(Math.sin(rad)) * half + Math.abs(Math.cos(rad)) * thick;
        return (axis === 'x' ? ex : axis === 'y' ? ey : (ex + ey) / 2) * zoom;
      },
      [geometry, zoom],
    );
    const { labels, badgeBoxes, pins, leaders } = useMemo(() => {
      const badgeList = [];
      const hardBlocks = [];
      const softBadges = [];
      const FAR = 100000;
      const chrome = [];
      if (insets.left > 0) {
        chrome.push({ x0: -100000, y0: -100000, x1: insets.left, y1: FAR });
      }
      if (insets.top > 0) {
        chrome.push({ x0: -100000, y0: -100000, x1: FAR, y1: insets.top });
      }
      if (insets.bottom > 0) {
        chrome.push({ x0: -100000, y0: size.h - insets.bottom, x1: FAR, y1: FAR });
      }
      for (const box of blockers) {
        chrome.push(box);
      }
      const markers = net.stations.map((station) => {
        const p = toScreen(pos(station.id));
        return {
          id: station.id,
          x: p.x,
          y: p.y,
          r: Math.max(markerExtent(station.id, 'x'), markerExtent(station.id, 'y')) + 1,
        };
      });
      const segments = [];
      for (const edge of geometry.edges) {
        const radius = (((edge.lines.length - 1) * LANE_GAP) / 2 + LANE_WIDTH / 2 + CASING_WIDTH) * zoom;
        for (let k = 0; k < edge.pts.length - 1; k++) {
          const a = toScreen(edge.pts[k]);
          const b = toScreen(edge.pts[k + 1]);
          segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, r: radius });
        }
      }
      const allDimmed = (lineIds, stationId) => lineIds.every((lineId) => isDimmed(stationId, lineId));
      const badgeOrder = [...endBadges].sort(
        (a, b) => Number(allDimmed(a[1], a[0])) - Number(allDimmed(b[1], b[0])),
      );
      for (const [stationId, lineIds] of badgeOrder) {
        const layout = STATION_LAYOUT[stationId];
        const symbol = geometry.symbols.get(stationId);
        const arm = symbol.arms[0] ?? { x: 1, y: 0 };
        const side = layout.badge ?? (symbol.terminal ? nearestCompass({ x: -arm.x, y: -arm.y }) : 'e');
        const at = toScreen(pos(stationId));
        const chips = lineIds.map((lid) => {
          const name = net.lineById.get(lid).name;
          return { lid, text: name, w: measureText(name, 11.5, 700, LABEL_FONT) + 14, h: 19 };
        });
        const chipBox = (dir) => {
          const isRow = dir === 'n' || dir === 's';
          const width = isRow
            ? chips.reduce((acc, item) => acc + item.w + 3, -3)
            : Math.max(...chips.map((chip) => chip.w));
          const height = isRow ? 19 : chips.reduce((acc, item) => acc + item.h + 3, -3);
          const standoff =
            (dir === 'e' || dir === 'w'
              ? markerExtent(stationId, 'x')
              : dir === 'n' || dir === 's'
                ? markerExtent(stationId, 'y')
                : markerExtent(stationId, 'diag')) + 6;
          return {
            horizontal: isRow,
            box: placeLabel({ sx: at.x, sy: at.y, standoff, width, height }, dir).box,
          };
        };
        const inView = (box) => box.x0 >= 2 && box.y0 >= 2 && box.x1 <= size.w - 2 && box.y1 <= size.h - 2;
        const blocked = (box) => chrome.some((b) => boxesOverlap(b, box, 2));
        const overlapsBadge = (box) => badgeList.some((other) => boxesOverlap(other.box, box, 2));
        const dimmedAll = allDimmed(lineIds, stationId);
        let choice = chipBox(side);
        if (blocked(choice.box)) {
          continue;
        }
        if (!inView(choice.box) || overlapsBadge(choice.box)) {
          const clear = (box) =>
            !markers.some(
              (marker) => marker.id !== stationId && circleHitsBox(marker.x, marker.y, marker.r + 2, box),
            ) && !segments.some((seg) => boxHitsSegment(box, seg));
          const fallback = ['n', 's', 'ne', 'se', 'nw', 'sw', 'e', 'w']
            .filter((dir) => dir !== side)
            .map(chipBox)
            .find(
              (option) =>
                inView(option.box) && !blocked(option.box) && !overlapsBadge(option.box) && clear(option.box),
            );
          if (fallback) {
            choice = fallback;
          } else if (!inView(choice.box) || dimmedAll) {
            continue;
          }
        }
        const { horizontal, box } = choice;
        let cx = box.x0;
        let cy = box.y0;
        for (const chip of chips) {
          const rect = { x0: cx, y0: cy, x1: cx + chip.w, y1: cy + chip.h };
          badgeList.push({ id: stationId, lineId: chip.lid, box: rect, text: chip.text });
          if (horizontal) {
            cx += chip.w + 3;
          } else {
            cy += chip.h + 3;
          }
        }
        if (dimmedAll) {
          softBadges.push({ box, id: stationId });
        } else {
          hardBlocks.push(box);
        }
      }
      hardBlocks.push(...chrome);
      const priority = new Set([
        ...(selected ? [selected] : []),
        ...(pointA ? [pointA] : []),
        ...(pointB ? [pointB] : []),
        ...(hovered ? [hovered] : []),
        ...(focused ? [focused] : []),
        ...tripStations.changes,
        ...(reach ? [reach.origin] : []),
        ...(reach?.origin2 ? [reach.origin2] : []),
        ...(reach?.best ? [reach.best] : []),
        ...(marks ? [...marks.keys()] : []),
      ]);
      const labelCandidates = (
        hideNames ? net.stations.filter((station) => marks?.has(station.id)) : net.stations
      ).map((station) => {
        const layout = STATION_LAYOUT[station.id];
        const minutes =
          reach && station.id !== reach.origin && station.id !== reach.origin2
            ? reach.stops.get(station.id)?.minutes
            : undefined;
        const text =
          minutes != null && minutes <= reach.horizon ? `${layout.label} · ${minutes}` : layout.label;
        const p = toScreen(pos(station.id));
        const rank = priority.has(station.id)
          ? 0
          : itinerary && tripStations.all.has(station.id)
            ? Math.min(layout.rank, 2)
            : layout.rank;
        const major = rank <= 1 || layout.rank === 1;
        const fontSize = priority.has(station.id) ? 14 : major ? 13.5 : 12.5;
        const weight = priority.has(station.id) ? 750 : major ? 700 : 500;
        const anchor = layout.anchor;
        const axis = anchor === 'e' || anchor === 'w' ? 'x' : anchor === 'n' || anchor === 's' ? 'y' : 'diag';
        return {
          id: station.id,
          text,
          sx: p.x,
          sy: p.y,
          standoff: markerExtent(station.id, axis) + 6 + (layout.gap ?? 0),
          anchor,
          rank,
          width: measureText(text, fontSize, weight, LABEL_FONT) + 2,
          height: fontSize + 5,
        };
      });
      const pinList = [];
      const pinBoxes = [];
      const PIN_R = 10.5;
      const pinned = net.stations.filter(
        (station) =>
          station.id === pointA ||
          station.id === pointB ||
          tripStations.changes.has(station.id) ||
          marks?.has(station.id) ||
          station.id === reach?.best,
      );
      for (const station of pinned) {
        const p = toScreen(pos(station.id));
        let spot = null;
        const base = Math.max(markerExtent(station.id, 'x'), markerExtent(station.id, 'y'));
        search: for (const dist of [base + PIN_R + 3, base + PIN_R + 11, base + PIN_R + 20]) {
          for (const [sx, sy] of [
            [1, -1],
            [1, 1],
            [-1, -1],
            [-1, 1],
          ]) {
            const x = p.x + sx * dist * 0.7071;
            const y = p.y + sy * dist * 0.7071;
            const box = { x0: x - PIN_R, y0: y - PIN_R, x1: x + PIN_R, y1: y + PIN_R };
            const blocked =
              badgeList.some((badge) => circleHitsBox(x, y, 11.5, badge.box)) ||
              pinBoxes.some((b) => circleHitsBox(x, y, 11.5, b)) ||
              hardBlocks.some((b) => circleHitsBox(x, y, PIN_R, b)) ||
              segments.some((seg) => circleHitsSegment(x, y, PIN_R, seg));
            spot ||= { x, y, box };
            if (!blocked) {
              spot = { x, y, box };
              break search;
            }
          }
        }
        if (spot) {
          pinList.push({
            id: station.id,
            x: spot.x,
            y: spot.y,
            kind:
              marks?.get(station.id) ??
              (station.id === reach?.best
                ? 'meet'
                : station.id === pointA
                  ? 'A'
                  : station.id === pointB
                    ? 'B'
                    : 'change'),
          });
          pinBoxes.push(spot.box);
        }
      }
      const maxRank = hideNames ? 3 : reach ? (zoom < 0.38 ? 1 : 3) : zoom < 0.5 ? 1 : zoom < 0.7 ? 2 : 3;
      const labelList = layoutLabels(
        labelCandidates,
        markers,
        [...hardBlocks, ...pinBoxes],
        { w: size.w, h: size.h },
        maxRank,
        segments,
        softBadges.map((badge) => badge.box),
      );
      const coveredBadges = new Set(
        softBadges
          .filter((badge) => labelList.some((label) => boxesOverlap(label.box, badge.box, 1)))
          .map((badge) => badge.id),
      );
      if (coveredBadges.size) {
        for (let i = badgeList.length - 1; i >= 0; i--) {
          if (coveredBadges.has(badgeList[i].id)) {
            badgeList.splice(i, 1);
          }
        }
      }
      const leaderList = [];
      for (const label of labelList) {
        const p = toScreen(pos(label.id));
        const radius = Math.max(markerExtent(label.id, 'x'), markerExtent(label.id, 'y'));
        const x1 = Math.min(Math.max(p.x, label.box.x0), label.box.x1);
        const y1 = Math.min(Math.max(p.y, label.box.y0), label.box.y1);
        const dist = Math.hypot(x1 - p.x, y1 - p.y);
        if (!(dist < radius + 28)) {
          leaderList.push({
            id: label.id,
            x0: p.x + ((x1 - p.x) / dist) * (radius + 3),
            y0: p.y + ((y1 - p.y) / dist) * (radius + 3),
            x1,
            y1,
          });
        }
      }
      return { labels: labelList, badgeBoxes: badgeList, pins: pinList, leaders: leaderList };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- pos, toScreen and markerExtent derive from geometry and the view, which are listed.
    }, [
      net,
      endBadges,
      geometry,
      zoom,
      view.x,
      view.y,
      selected,
      pointA,
      pointB,
      hovered,
      focused,
      tripStations,
      itinerary,
      size.w,
      size.h,
      fontEpoch,
      insets,
      blockers,
      reach,
      marks,
      hideNames,
      isDimmed,
    ]);
    const hidden = useMemo(() => {
      const hiddenSet = new Set();
      const fontSize = (15 * zoom) / Math.max(zoom, 0.6);
      const occupied = [
        ...badgeBoxes.map((b) => b.box),
        ...labels.map((l) => l.box),
        ...pins.map((pin) => ({ x0: pin.x - 11, y0: pin.y - 11, x1: pin.x + 11, y1: pin.y + 11 })),
      ];
      for (const label of AREA_LABELS) {
        const upper = label.text.toUpperCase();
        const width = measureText(upper, fontSize, 600, LABEL_FONT) + upper.length * 0.14 * fontSize;
        const rad = ((label.rotate ?? 0) * Math.PI) / 180;
        const center = toScreen({ x: label.x * 11, y: label.y * 11 });
        const hx = (Math.cos(rad) * width) / 2;
        const hy = (Math.sin(rad) * width) / 2;
        const seg = {
          ax: center.x - hx,
          ay: center.y - hy,
          bx: center.x + hx,
          by: center.y + hy,
          r: fontSize * 0.55,
        };
        if (occupied.some((box) => boxHitsSegment(box, seg))) {
          hiddenSet.add(label.text);
        }
      }
      return hiddenSet;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- toScreen derives from the view, which is listed.
    }, [badgeBoxes, labels, pins, zoom, view.x, view.y, fontEpoch]);
    const handleStationClick = useCallback(
      (stationId) => {
        if (!panZoom.wasDragged()) {
          onStationClick(stationId);
        }
      },
      [panZoom, onStationClick],
    );
    const linesLabel = useMemo(() => {
      const map = new Map();
      for (const station of net.stations) {
        const names = net.linesAt(station.id).map((lineId) => net.lineById.get(lineId).name);
        map.set(station.id, names.join(', '));
      }
      return map;
    }, [net]);
    const moveFocus = (fromId, dx, dy) => {
      const origin = pos(fromId);
      let best = null;
      for (const station of net.stations) {
        if (station.id === fromId) {
          continue;
        }
        const p = pos(station.id);
        const vx = p.x - origin.x;
        const vy = p.y - origin.y;
        const dist = Math.hypot(vx, vy);
        const alignment = (vx * dx + vy * dy) / dist;
        if (alignment < 0.5) {
          continue;
        }
        const score = dist * (1.6 - alignment);
        if (!best || score < best.score) {
          best = { id: station.id, score };
        }
      }
      if (best) {
        setTabStop(best.id);
        requestAnimationFrame(() => document.getElementById(`station-${best.id}`)?.focus());
      }
    };
    const onKeyDown = (event) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const step = event.shiftKey ? 220 : 70;
      switch (event.key) {
        case 'ArrowLeft':
          panZoom.panBy(step, 0, true);
          break;
        case 'ArrowRight':
          panZoom.panBy(-step, 0, true);
          break;
        case 'ArrowUp':
          panZoom.panBy(0, step, true);
          break;
        case 'ArrowDown':
          panZoom.panBy(0, -step, true);
          break;
        case '+':
        case '=':
          panZoom.zoomAt(1.4, undefined, true);
          break;
        case '-':
        case '_':
          panZoom.zoomAt(1 / 1.4, undefined, true);
          break;
        case '0':
          panZoom.fitAnimated(fitBounds, 420);
          break;
        case 'Escape':
          onBackgroundClick();
          return;
        default:
          return;
      }
      event.preventDefault();
    };
    const onStationKeyDown = (event, stationId) => {
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[event.key]) {
        event.preventDefault();
        moveFocus(stationId, dirs[event.key][0], dirs[event.key][1]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onStationClick(stationId);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        surfaceRef.current?.focus();
        onBackgroundClick();
      } else if (event.key === '+' || event.key === '=') {
        panZoom.zoomAt(1.4, toScreen(pos(stationId)), true);
      } else if (event.key === '-') {
        panZoom.zoomAt(1 / 1.4, toScreen(pos(stationId)), true);
      }
    };
    const isStationDim = (stationId) => {
      if (reachSet) {
        return !reachSet.has(stationId);
      }
      if (itinerary) {
        return !tripStations.all.has(stationId);
      }
      if (highlightLine) {
        return !net.linesAt(stationId).includes(highlightLine);
      }
      return false;
    };
    const onTrainPick = replay?.onPick;
    const onPick = useCallback(
      (trainId) => {
        if (!panZoom.wasDragged()) {
          onTrainPick?.(trainId);
        }
      },
      [panZoom, onTrainPick],
    );
    const reachDescription = (stationId) => {
      if (!reach) {
        return '';
      }
      if (stationId === reach.origin) {
        if (reach.origin2) {
          return ' Person A’s starting station.';
        }
        return ' Starting point for the reach map.';
      }
      if (stationId === reach.origin2) {
        return ' Person B’s starting station.';
      }
      const entry = reach.stops.get(stationId);
      if (entry) {
        if (reach.origin2) {
          if (entry.minutes <= reach.horizon) {
            return ` The later of you gets here in ${entry.minutes} minutes.`;
          }
          return ` The later of you needs more than ${reach.horizon} minutes.`;
        }
        if (entry.minutes <= reach.horizon) {
          return ` ${entry.minutes} minutes away.`;
        }
        return ` More than ${reach.horizon} minutes away.`;
      }
      return '';
    };
    const visible = zoom > 0.9;
    const hitRadius = (stationId) =>
      Math.max(
        15 / zoom,
        Math.max(geometry.symbols.get(stationId).half, geometry.symbols.get(stationId).thick),
      );
    // Hit circles overlap on a small or zoomed-out map, so the one under the pointer can be a neighbor's.
    const stationAt = (event, stationId) => {
      const rect = surfaceRef.current.getBoundingClientRect();
      const point = panZoom.toWorld(event.clientX - rect.left, event.clientY - rect.top);
      const targets = net.stations.map((station) => ({
        id: station.id,
        ...pos(station.id),
        r: hitRadius(station.id),
      }));
      return nearestStation(targets, point) ?? stationId;
    };
    const onStationHover = (event, stationId) => {
      if (event.pointerType === 'mouse') {
        setHovered(stationAt(event, stationId));
      }
    };
    return (
      <div
        ref={surfaceRef}
        className={`map-surface${pickMode ? ' is-picking' : ''}`}
        tabIndex={0}
        role="group"
        aria-roledescription="interactive map"
        aria-label="BART schematic map. Arrow keys pan, plus and minus zoom, zero fits the whole network. Press Tab to move to the stations."
        onKeyDown={onKeyDown}
        onClick={(event) => {
          const target = event.target;
          if (!(panZoom.wasDragged() || target.closest('[data-station],.lane,.train'))) {
            onBackgroundClick();
          }
        }}
      >
        <svg className="map-svg" width={size.w} height={size.h} role="presentation">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <GeographyLayer geography={geography} />
            <AreaLabels scale={zoom} hidden={hidden} />
            <LinesLayer
              net={net}
              geometry={geometry}
              service={service}
              focus={focus}
              onLineClick={onLineClick}
            />
            {reach && (
              <ReachLayer
                geometry={geometry}
                stops={reach.stops}
                horizon={reach.horizon}
                origin={reach.origin}
                origin2={reach.origin2 ?? null}
                band={(station) => reachBand(station, reach.horizon)}
              />
            )}
            <TrackFeatures geometry={geometry} visible={visible} />
            {net.stations.map((station) => (
              <StationMarker
                key={station.id}
                symbol={geometry.symbols.get(station.id)}
                state={isStationDim(station.id) ? 'dim' : 'normal'}
              />
            ))}
            {net.stations.map((station) => {
              const symbol = geometry.symbols.get(station.id);
              const isSelected = station.id === selected;
              const isEnd = station.id === pointA || station.id === pointB;
              const isChange = tripStations.changes.has(station.id);
              const isFocused = station.id === focused;
              const isOrigin = reach?.origin === station.id || reach?.origin2 === station.id;
              const mark = marks?.get(station.id);
              if (!isSelected && !isEnd && !isChange && !isFocused && !isOrigin && !mark) {
                return null;
              }
              const radius = Math.max(symbol.half, symbol.thick) + (isEnd || isOrigin ? 5.5 : 4.5);
              return (
                <circle
                  key={`ring-${station.id}`}
                  className={`ring${isSelected ? ' ring-selected' : ''}${isEnd || isOrigin ? ' ring-end' : ''}${isFocused ? ' ring-focus' : ''}${mark ? ` ring-${mark}` : ''}`}
                  cx={symbol.x}
                  cy={symbol.y}
                  r={radius}
                />
              );
            })}
            <g role="group" aria-label="Stations">
              {net.stations.map((station) => (
                <g
                  key={station.id}
                  id={`station-${station.id}`}
                  data-station={station.id}
                  role="button"
                  tabIndex={station.id === tabStop ? 0 : -1}
                  aria-label={
                    hideNames && !marks?.has(station.id)
                      ? `Station on the ${linesLabel.get(station.id)} lines.`
                      : `${station.name}. Lines: ${linesLabel.get(station.id)}.${station.id === from ? ' Starting station.' : ''}${station.id === to ? ' Destination.' : ''}${station.id === selected ? ' Selected.' : ''}${reachDescription(station.id)}`
                  }
                  aria-pressed={station.id === selected}
                  className="hit"
                  onClick={(event) =>
                    // A click that no pointer made (assistive technology, a script) has no position.
                    handleStationClick(event.detail ? stationAt(event, station.id) : station.id)
                  }
                  onKeyDown={(event) => onStationKeyDown(event, station.id)}
                  onPointerEnter={(event) => onStationHover(event, station.id)}
                  onPointerMove={(event) => onStationHover(event, station.id)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={(event) => {
                    setTabStop(station.id);
                    if (event.currentTarget.matches(':focus-visible')) {
                      setFocused(station.id);
                      panZoom.ensureVisible(pos(station.id), 110);
                    }
                  }}
                  onBlur={() =>
                    setFocused((prev) => {
                      if (prev === station.id) {
                        return null;
                      }
                      return prev;
                    })
                  }
                >
                  <circle cx={pos(station.id).x} cy={pos(station.id).y} r={hitRadius(station.id)} />
                </g>
              ))}
            </g>
            {replay && (
              <TrainsLayer
                net={net}
                geometry={geometry}
                clock={replay.clock}
                day={replay.day}
                scale={zoom}
                followId={replay.followId}
                lineFilter={replay.lineFilter}
                onPick={onPick}
              />
            )}
          </g>
          <g className="overlay" aria-hidden="true">
            {badgeBoxes.map((badge) => {
              const line = net.lineById.get(badge.lineId);
              const dim = isDimmed(badge.id, badge.lineId);
              return (
                <g key={`${badge.id}-${badge.lineId}`} className={dim ? 'badge is-dim' : 'badge'}>
                  <rect
                    x={badge.box.x0}
                    y={badge.box.y0}
                    width={badge.box.x1 - badge.box.x0}
                    height={badge.box.y1 - badge.box.y0}
                    rx={9.5}
                    fill={dim ? undefined : line.color}
                    style={dim ? { stroke: line.color } : undefined}
                    className="badge-bg"
                  />
                  <text
                    x={(badge.box.x0 + badge.box.x1) / 2}
                    y={(badge.box.y0 + badge.box.y1) / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="badge-text"
                  >
                    {badge.text}
                  </text>
                </g>
              );
            })}
            {leaders.map((leader) => (
              <line
                key={`leader-${leader.id}`}
                className="label-leader"
                x1={leader.x0}
                y1={leader.y0}
                x2={leader.x1}
                y2={leader.y1}
              />
            ))}
            {labels.map((label) => (
              <StationLabel
                key={label.id}
                l={label}
                dim={isStationDim(label.id) && label.rank > 0}
                strong={label.id === selected || label.id === from || label.id === to}
              />
            ))}
            {pins.map((pin) => (
              <g
                key={`pin-${pin.id}`}
                transform={`translate(${pin.x} ${pin.y})`}
                className={pin.kind === 'A' || pin.kind === 'B' ? 'pin' : `pin pin-${pin.kind}`}
              >
                <circle r={10.5} />
                <PinGlyph kind={pin.kind} />
              </g>
            ))}
          </g>
        </svg>
      </div>
    );
  }),
);
