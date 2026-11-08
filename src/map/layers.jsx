import { memo } from 'react';
import { AREA_LABELS, CASING_WIDTH, LANE_WIDTH, TRACK_FEATURES } from './schematic';

export const GeographyLayer = memo(function ({ geography }) {
  if (geography) {
    return (
      <g aria-hidden="true" className="geo">
        <path className="geo-land" d={geography.land} fillRule="evenodd" />
        <path className="geo-coast" d={geography.coast} fill="none" />
      </g>
    );
  }
  return null;
});

function activeLaneKeys(net, service) {
  const keys = new Set();
  for (const pattern of net.activePatterns(service)) {
    for (let i = 0; i < pattern.stations.length - 1; i++) {
      const a = pattern.stations[i];
      const b = pattern.stations[i + 1];
      keys.add(`${a < b ? `${a}|${b}` : `${b}|${a}`}#${pattern.lineId}`);
    }
  }
  return keys;
}

export const LinesLayer = memo(function ({ net, geometry, service, focus, onLineClick }) {
  const active = activeLaneKeys(net, service);
  const tripLanes = new Set();
  if (focus.itinerary) {
    for (const leg of focus.itinerary.legs) {
      for (let i = 0; i < leg.stops.length - 1; i++) {
        const a = leg.stops[i];
        const b = leg.stops[i + 1];
        tripLanes.add(`${a < b ? `${a}|${b}` : `${b}|${a}`}#${leg.lineId}`);
      }
    }
  }
  const dimming = !!focus.lineId || !!focus.itinerary || !!focus.reach;
  const lanes = [];
  for (const edge of geometry.edges) {
    for (const lineId of edge.lines) {
      const key = `${edge.key}#${lineId}`;
      let state = active.has(key) ? 'normal' : 'off';
      if (focus.itinerary) {
        state = tripLanes.has(key) ? 'trip' : 'dim';
      } else if (focus.reach) {
        state =
          state === 'off' ? 'off' : focus.reach.has(edge.from) && focus.reach.has(edge.to) ? 'normal' : 'dim';
      } else if (focus.lineId) {
        state = lineId === focus.lineId ? (state === 'off' ? 'off' : 'normal') : 'dim';
      }
      lanes.push({ edge, lineId, d: geometry.lanePath(edge, lineId), state });
    }
  }
  const colorOf = (lineId) => net.lineById.get(lineId).color;
  return (
    <g className={`lines${dimming ? ' is-dimming' : ''}`}>
      {lanes.map(({ edge, lineId, d, state }) => (
        <g key={`c-${edge.key}-${lineId}`}>
          {state === 'trip' && <path d={d} className="trip-halo" strokeWidth={14.2} />}
          <path
            d={d}
            className={`casing casing-${state}`}
            data-line={lineId}
            strokeWidth={lineId === 'yellow' ? LANE_WIDTH + 1.5 : LANE_WIDTH + CASING_WIDTH * 2}
          />
        </g>
      ))}
      {lanes.map(({ edge, lineId, d, state }) => (
        <path
          key={`l-${edge.key}-${lineId}`}
          d={d}
          className={`lane lane-${state}`}
          data-line={lineId}
          stroke={colorOf(lineId)}
          strokeWidth={LANE_WIDTH}
          strokeDasharray={state === 'off' ? '2.2 3.4' : undefined}
          onClick={() => onLineClick(lineId)}
        >
          <title>{`${net.lineById.get(lineId).name} line`}</title>
        </path>
      ))}
    </g>
  );
});

export const TrackFeatures = memo(function ({ geometry, visible }) {
  if (visible) {
    return (
      <g aria-hidden="true">
        {TRACK_FEATURES.map((feature) => {
          const edge = geometry.edgeByKey.get(
            feature.between[0] < feature.between[1]
              ? `${feature.between[0]}|${feature.between[1]}`
              : `${feature.between[1]}|${feature.between[0]}`,
          );
          if (!edge) {
            return null;
          }
          const frac = edge.from === feature.between[0] ? feature.at : 1 - feature.at;
          const { p, angle } = geometry.pointAlong(edge, frac);
          return (
            <rect
              key={feature.id}
              className="track-feature"
              x={-2.4}
              y={-6.5}
              width={4.8}
              height={13}
              rx={1.6}
              transform={`translate(${p.x} ${p.y}) rotate(${angle})`}
            />
          );
        })}
      </g>
    );
  }
  return null;
});

export const AreaLabels = memo(function ({ scale, hidden }) {
  return (
    <g aria-hidden="true" className="area-labels" style={{ opacity: scale < 1.6 ? 1 : 0.5 }}>
      {AREA_LABELS.map((label) => (
        <text
          key={label.text}
          className={`area-label area-${label.kind}${hidden?.has(label.text) ? ' is-hidden' : ''}`}
          transform={`translate(${label.x * 11} ${label.y * 11}) rotate(${label.rotate ?? 0}) scale(${1 / Math.max(scale, 0.6)})`}
          textAnchor="middle"
        >
          {label.text}
        </text>
      ))}
    </g>
  );
});

export const StationMarker = memo(function ({ symbol, state }) {
  const className = `marker marker-${symbol.kind}${symbol.interchange ? ' is-interchange' : ''}${symbol.terminal ? ' is-terminal' : ''}${state === 'dim' ? ' is-dim' : ''}`;
  if (symbol.kind === 'dot' || symbol.kind === 'disc') {
    return <circle className={className} cx={symbol.x} cy={symbol.y} r={symbol.half} />;
  }
  return (
    <g transform={`translate(${symbol.x} ${symbol.y}) rotate(${symbol.angle})`} className={className}>
      <rect
        x={-symbol.half}
        y={-symbol.thick}
        width={symbol.half * 2}
        height={symbol.thick * 2}
        rx={Math.min(symbol.thick, 5.5)}
        className="marker-shape"
      />
      {symbol.kind === 'bar' && (
        <rect
          x={-symbol.half + 3.2}
          y={-symbol.thick + 3.2}
          width={symbol.half * 2 - 6.4}
          height={symbol.thick * 2 - 6.4}
          rx={1.4}
          className="marker-core"
        />
      )}
    </g>
  );
});

export const ReachLayer = memo(function ({ geometry, stops, horizon, origin, origin2, band }) {
  return (
    <g aria-hidden="true" className="reach-layer">
      {[...stops].map(([stationId, entry]) => {
        const bandIndex = band(entry.minutes);
        if (bandIndex == null || stationId === origin || stationId === origin2 || entry.minutes > horizon) {
          return null;
        }
        const symbol = geometry.symbols.get(stationId);
        return (
          <circle
            key={stationId}
            className={`reach-disc reach-${bandIndex}`}
            cx={symbol.x}
            cy={symbol.y}
            r={Math.max(symbol.half, symbol.thick) + 6.5}
          />
        );
      })}
    </g>
  );
});

var PIN_GLYPHS = {
  change: 'M-4.5 -2.2h8m-2.4 -2.4l2.4 2.4l-2.4 2.4M4.5 2.2h-8m2.4 -2.4l-2.4 2.4l2.4 2.4',
  right: 'M-4.6 0.4L-1.4 3.6L4.8 -3.6',
  wrong: 'M-3.8 -3.8L3.8 3.8M3.8 -3.8L-3.8 3.8',
  answer: 'M0 -4.6V4.6M-4.6 0H4.6',
  meet: 'M0 -5.2L1.6 -1.8L5.2 -1.5L2.5 0.9L3.3 4.5L0 2.6L-3.3 4.5L-2.5 0.9L-5.2 -1.5L-1.6 -1.8Z',
};

export function PinGlyph({ kind }) {
  if (kind === 'A' || kind === 'B') {
    return (
      <text textAnchor="middle" dominantBaseline="central">
        {kind}
      </text>
    );
  }
  if (kind === 'meet') {
    return <path d={PIN_GLYPHS.meet} className="glyph-star" />;
  }
  return (
    <path d={PIN_GLYPHS[kind]} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  );
}

export function StationLabel({ l: label, dim, strong }) {
  return (
    <text
      x={label.x}
      y={label.y}
      textAnchor={label.textAnchor}
      dominantBaseline="central"
      className={`station-label rank-${label.rank}${strong ? ' is-strong' : ''}${dim ? ' is-dim' : ''}`}
    >
      {label.text}
    </text>
  );
}
