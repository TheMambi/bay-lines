import { memo, useEffect, useMemo, useRef } from 'react';
import { scheduledTrains, trainsAt } from '../lib/replay';
import { trainLocator } from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TRAIN_SHAPE = 'M-6.6 -3.5H1.6L6.8 0L1.6 3.5H-6.6Z';

export const TrainsLayer = memo(function ({
  net,
  geometry,
  clock,
  day,
  scale,
  followId,
  lineFilter,
  onPick,
}) {
  const layerRef = useRef(null);
  const trains = useMemo(() => scheduledTrains(net, day), [net, day]);
  const locate = useMemo(() => trainLocator(geometry), [geometry]);
  const scaleRef = useRef(scale);
  const followRef = useRef(followId);
  const filterRef = useRef(lineFilter);
  scaleRef.current = scale;
  followRef.current = followId;
  filterRef.current = lineFilter;
  const redrawRef = useRef(() => {});
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      return;
    }
    const nodes = new Map();
    const draw = () => {
      const size = Math.min(2.4, Math.max(1, 1.25 / scaleRef.current));
      const seen = new Set();
      for (const position of trainsAt(net, trains, clock.minute)) {
        if (
          filterRef.current &&
          position.train.lineId !== filterRef.current &&
          position.train.id !== followRef.current
        ) {
          continue;
        }
        const point = locate(position);
        if (!point) {
          continue;
        }
        const id = position.train.id;
        seen.add(id);
        let node = nodes.get(id);
        if (!node) {
          node = document.createElementNS(SVG_NS, 'g');
          node.setAttribute('class', 'train');
          node.setAttribute('data-train', id);
          const hit = document.createElementNS(SVG_NS, 'circle');
          hit.setAttribute('r', '10');
          hit.setAttribute('class', 'train-hit');
          const halo = document.createElementNS(SVG_NS, 'path');
          halo.setAttribute('d', TRAIN_SHAPE);
          halo.setAttribute('class', 'train-halo');
          const body = document.createElementNS(SVG_NS, 'path');
          body.setAttribute('d', TRAIN_SHAPE);
          body.setAttribute('class', 'train-body');
          body.setAttribute('fill', net.lineById.get(position.train.lineId)?.color ?? '#888');
          node.append(hit, halo, body);
          layer.appendChild(node);
          nodes.set(id, node);
        }
        node.setAttribute(
          'transform',
          `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${point.angle.toFixed(0)}) scale(${size.toFixed(2)})`,
        );
        node.classList.toggle('is-followed', id === followRef.current);
      }
      for (const [id, node] of nodes) {
        if (!seen.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    };
    redrawRef.current = draw;
    draw();
    const unsubscribe = clock.subscribe(draw);
    return () => {
      unsubscribe();
      redrawRef.current = () => {};
      layer.replaceChildren();
    };
  }, [net, trains, clock, locate]);
  useEffect(() => {
    redrawRef.current();
  }, [scale, followId, lineFilter]);
  return (
    <g
      ref={layerRef}
      className="trains"
      aria-hidden="true"
      onClick={(event) => {
        const id = event.target.closest('[data-train]')?.getAttribute('data-train') ?? null;
        if (id) {
          event.stopPropagation();
          onPick(id === followRef.current ? null : id);
        }
      }}
    />
  );
});
