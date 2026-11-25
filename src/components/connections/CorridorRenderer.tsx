import { memo, useMemo } from 'react';
import { GRID_SIZE } from '../../editor/grid';
import type { CorridorCell } from '../../editor/connectors/corridor/corridorGeometry';
import { corridorWalls } from '../../editor/connectors/corridor/corridorShape';

interface CorridorRendererProps {
  cells: CorridorCell[];
  isSelected: boolean;
  interactive: boolean;
}

/** Shapes only. Geometry is calculated outside React and shared by all layers. */
export const CorridorRenderer = memo(function CorridorRenderer({ cells, isSelected, interactive }: CorridorRendererProps) {
  const paths = useMemo(() => ({
    floor: cells.map(cell => `M ${cell.x * GRID_SIZE} ${cell.y * GRID_SIZE} h ${GRID_SIZE} v ${GRID_SIZE} h ${-GRID_SIZE} Z`).join(' '),
    walls: cells.flatMap(corridorWalls).map(wall =>
      `M ${wall.x1 * GRID_SIZE} ${wall.y1 * GRID_SIZE} L ${wall.x2 * GRID_SIZE} ${wall.y2 * GRID_SIZE}`).join(' '),
  }), [cells]);
  return (
    <>
      <path data-corridor-floor="true" d={paths.floor} fill={isSelected ? '#bfdbfe' : '#e0e7ff'}
        pointerEvents={interactive ? 'fill' : 'none'} />
      <path data-corridor-walls="true" d={paths.walls} fill="none" stroke={isSelected ? '#2563eb' : '#475569'}
        strokeWidth={isSelected ? 2.5 : 1.5} strokeLinejoin="round" pointerEvents="none" />
    </>
  );
});
