import React, { useRef, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';

const GRID_SIZE = 40; // px per cell

interface GridCanvasProps {
  width: number;
  height: number;
  children?: React.ReactNode;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

/**
 * SVG canvas with:
 * - Grid lines (方眼紙)
 * - Zoom (wheel)
 * - Pan (middle-click drag or space+drag)
 */
export function GridCanvas({ width, height, children, svgRef }: GridCanvasProps) {
  const { view, setView } = useDungeonStore(useShallow(s => ({ view: s.view, setView: s.setView })));
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const spaceDown = useRef(false);

  // Keep a ref to the latest view so the wheel handler can read it without
  // needing to be re-registered every time view changes.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Internal ref for the SVG element used by the wheel effect.
  const localRef = useRef<SVGSVGElement | null>(null);

  // Callback ref: populate both the local ref and the forwarded svgRef.
  const setRefs = useCallback(
    (node: SVGSVGElement | null) => {
      localRef.current = node;
      if (svgRef) svgRef.current = node;
    },
    [svgRef]
  );

  // ── Zoom (non-passive wheel listener) ────────────────────────────────────
  // React attaches onWheel as a passive listener in modern browsers, which
  // prevents preventDefault() from working. Register manually with
  // { passive: false } so we can block the page scroll while zooming.
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom, panX, panY } = viewRef.current;
      const scaleFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(4, Math.max(0.25, zoom * scaleFactor));

      // Zoom toward cursor
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const newPanX = cx - (cx - panX) * (newZoom / zoom);
      const newPanY = cy - (cy - panY) * (newZoom / zoom);

      setView({ zoom: newZoom, panX: newPanX, panY: newPanY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setView]); // setView is stable; viewRef is a ref — no need to re-register

  // ── Pan ───────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button === 1 || spaceDown.current) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
        e.preventDefault();
      }
    },
    [view]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setView({ panX: panStart.current.panX + dx, panY: panStart.current.panY + dy });
    },
    [setView]
  );

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Space-key pan
  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.code === 'Space') { spaceDown.current = true; e.preventDefault(); }
  }, []);
  const onKeyUp = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.code === 'Space') { spaceDown.current = false; }
  }, []);

  // ── Grid pattern ─────────────────────────────────────────────────────────
  const gs = GRID_SIZE * view.zoom;
  const offsetX = ((view.panX % gs) + gs) % gs;
  const offsetY = ((view.panY % gs) + gs) % gs;

  return (
    <svg
      ref={setRefs}
      width={width}
      height={height}
      style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'default', outline: 'none' }}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <defs>
        <pattern
          id="grid-minor"
          width={gs}
          height={gs}
          x={offsetX}
          y={offsetY}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gs} 0 L 0 0 0 ${gs}`}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="0.5"
          />
        </pattern>
        <pattern
          id="grid-major"
          width={gs * 5}
          height={gs * 5}
          x={offsetX}
          y={offsetY}
          patternUnits="userSpaceOnUse"
        >
          <rect width={gs * 5} height={gs * 5} fill="url(#grid-minor)" />
          <path
            d={`M ${gs * 5} 0 L 0 0 0 ${gs * 5}`}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width={width} height={height} fill="url(#grid-major)" />

      {/* Scene transform */}
      <g transform={`translate(${view.panX},${view.panY}) scale(${view.zoom})`}>
        {children}
      </g>
    </svg>
  );
}
