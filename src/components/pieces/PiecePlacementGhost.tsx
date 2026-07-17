import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { PlacedRoom } from '../../model/types';
import { getWorldCells } from '../../utils/geometry';
import { useDungeonStore } from '../../store';

const GRID_SIZE = 40;

interface PiecePlacementGhostProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/**
 * Renders a semi-transparent ghost of the pending piece that follows the cursor.
 * Click to commit the placement.
 */
export function PiecePlacementGhost({ svgRef }: PiecePlacementGhostProps) {
  const { pendingPiece, view, addRoom, dungeon } = useDungeonStore(s => ({
    pendingPiece: s.pendingPiece,
    view: s.view,
    addRoom: s.addRoom,
    dungeon: s.dungeon,
  }));

  const [gridPos, setGridPos] = useState({ x: 0, y: 0 });
  const [rotation] = useState<0 | 90 | 180 | 270>(0);

  const svgToGrid = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = (clientX - rect.left - view.panX) / view.zoom;
      const svgY = (clientY - rect.top - view.panY) / view.zoom;
      return {
        x: Math.floor(svgX / GRID_SIZE),
        y: Math.floor(svgY / GRID_SIZE),
      };
    },
    [svgRef, view]
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !pendingPiece) return;

    const onMove = (e: MouseEvent) => {
      setGridPos(svgToGrid(e.clientX, e.clientY));
    };
    svg.addEventListener('mousemove', onMove);
    return () => svg.removeEventListener('mousemove', onMove);
  }, [svgRef, pendingPiece, svgToGrid]);

  if (!pendingPiece) return null;

  const ghostRoom: PlacedRoom = {
    id: '__ghost__',
    pieceId: pendingPiece.id,
    piece: pendingPiece,
    position: gridPos,
    rotation,
    connections: {},
  };

  const cells = getWorldCells(ghostRoom);
  // Check collision
  const occupied = new Set(
    dungeon.rooms.flatMap(r => getWorldCells(r)).map(c => `${c.x},${c.y}`)
  );
  const hasCollision = cells.some(c => occupied.has(`${c.x},${c.y}`));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasCollision) return;
    const newRoom: PlacedRoom = {
      id: uuid(),
      pieceId: pendingPiece.id,
      piece: pendingPiece,
      position: gridPos,
      rotation,
      connections: {},
    };
    addRoom(newRoom);
  };

  const fillColor = hasCollision ? 'rgba(220,38,38,0.35)' : 'rgba(59,130,246,0.35)';
  const strokeColor = hasCollision ? '#dc2626' : '#2563eb';

  return (
    <g onMouseDown={handleClick} style={{ pointerEvents: 'all', cursor: hasCollision ? 'not-allowed' : 'crosshair' }}>
      {cells.map(c => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * GRID_SIZE}
          y={c.y * GRID_SIZE}
          width={GRID_SIZE}
          height={GRID_SIZE}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeDasharray="4,2"
        />
      ))}
    </g>
  );
}
