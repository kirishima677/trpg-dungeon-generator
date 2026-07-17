import React, { useRef, useCallback } from 'react';
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

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const scaleFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(4, Math.max(0.25, view.zoom * scaleFactor));

      // Zoom toward cursor
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const newPanX = cx - (cx - view.panX) * (newZoom / view.zoom);
      const newPanY = cy - (cy - view.panY) * (newZoom / view.zoom);

      setView({ zoom: newZoom, panX: newPanX, panY: newPanY });
    },
    [view, setView]
  );

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
      ref={svgRef}
      width={width}
      height={height}
      style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'default', outline: 'none' }}
      tabIndex={0}
      onWheel={onWheel}
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
