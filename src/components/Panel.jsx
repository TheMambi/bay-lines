import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const SNAPS = ['peek', 'half', 'full'];

const SNAP_LABELS = { peek: 'collapsed', half: 'half height', full: 'full height' };

export function Panel({ isDesktop, snap, onSnap, panelRef, children }) {
  const [dragHeight, setDragHeight] = useState(null);
  const dragRef = useRef(null);
  const elRef = useRef(null);
  const suppressClickRef = useRef(false);
  const ref = (el) => {
    elRef.current = el;
    if (typeof panelRef == 'function') {
      panelRef(el);
    } else if (panelRef) {
      panelRef.current = el;
    }
  };
  useEffect(() => {
    if (isDesktop) {
      setDragHeight(null);
    }
  }, [isDesktop]);
  const step = (delta) => onSnap(SNAPS[Math.min(2, Math.max(0, SNAPS.indexOf(snap) + delta))]);
  return (
    <aside
      ref={ref}
      className={`panel sheet-${snap}${dragHeight == null ? '' : ' is-dragging'}`}
      style={dragHeight == null ? undefined : { height: dragHeight }}
      aria-label="Search, route planner and station details"
    >
      {!isDesktop && (
        <button
          type="button"
          className="sheet-handle"
          aria-label={`Resize panel, currently ${SNAP_LABELS[snap]}. Press Enter to change, or use the up and down arrow keys.`}
          onPointerDown={(event) => {
            if (!isDesktop && elRef.current) {
              dragRef.current = {
                startY: event.clientY,
                startH: elRef.current.getBoundingClientRect().height,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) {
              return;
            }
            const dy = event.clientY - drag.startY;
            if (Math.abs(dy) > 4) {
              drag.moved = true;
            }
            if (drag.moved) {
              setDragHeight(Math.max(120, Math.min(window.innerHeight - 70, drag.startH - dy)));
            }
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag) {
              suppressClickRef.current = true;
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // The pointer may already be released.
              }
              if (drag.moved && dragHeight != null) {
                const vh = window.innerHeight;
                const nearest = [
                  ['peek', 150],
                  ['half', vh * 0.5],
                  ['full', vh * 0.88],
                ].reduce((acc, item) => {
                  if (Math.abs(item[1] - dragHeight) < Math.abs(acc[1] - dragHeight)) {
                    return item;
                  }
                  return acc;
                });
                setDragHeight(null);
                onSnap(nearest[0]);
              } else {
                setDragHeight(null);
                onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');
              }
            }
          }}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
            } else {
              onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragHeight(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              step(1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              step(-1);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');
            }
          }}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <Icon name={snap === 'full' ? 'down' : 'up'} size={16} className="sheet-chevron" />
        </button>
      )}
      {children}
    </aside>
  );
}
