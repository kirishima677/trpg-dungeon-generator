import { memo, useMemo } from 'react';
import { GRID_LINE_COLOR, GRID_LINE_WIDTH, GRID_SIZE } from '../../editor/grid';
import type { CorridorCell } from '../../editor/connectors/corridor/corridorGeometry';
import { corridorWalls } from '../../editor/connectors/corridor/corridorShape';

interface CorridorRendererProps {
  cells: readonly CorridorCell[];
  isSelected: boolean;
  interactive: boolean;
  selectedCellKeys?: ReadonlySet<string>;
}

/** Shapes only. Geometry is calculated outside React and shared by all layers. */
export const CorridorRenderer = memo(function CorridorRenderer({ cells, isSelected, interactive, selectedCellKeys }: CorridorRendererProps) {
  const shapes = useMemo(() => {
    const walls = new Map<string, { d: string; cellKeys: Set<string> }>();
    const boundaries = new Map<string, string>();
    const floors = cells.map(cell => {
      const key = `${cell.x},${cell.y}`;
      // All four cell borders, including openings toward neighbouring rooms.
      for (const edge of corridorWalls({ ...cell, connections: 0 })) {
        boundaries.set(`${edge.x1},${edge.y1},${edge.x2},${edge.y2}`,
          `M ${edge.x1 * GRID_SIZE} ${edge.y1 * GRID_SIZE} L ${edge.x2 * GRID_SIZE} ${edge.y2 * GRID_SIZE}`);
      }
      for (const wall of corridorWalls(cell)) {
        const edge = `${wall.x1},${wall.y1},${wall.x2},${wall.y2}`;
        if (!walls.has(edge)) walls.set(edge, {
          d: `M ${wall.x1 * GRID_SIZE} ${wall.y1 * GRID_SIZE} L ${wall.x2 * GRID_SIZE} ${wall.y2 * GRID_SIZE}`,
          cellKeys: new Set(),
        });
        walls.get(edge)!.cellKeys.add(key);
      }
      return { key, d: `M ${cell.x * GRID_SIZE} ${cell.y * GRID_SIZE} h ${GRID_SIZE} v ${GRID_SIZE} h ${-GRID_SIZE} Z` };
    });
    // Closed borders already have walls. Grid strokes only mark open borders.
    const grid = [...boundaries].filter(([key]) => !walls.has(key)).map(([, d]) => d).join(' ');
    return { floors, grid, walls: [...walls.values()] };
  }, [cells]);
  const paths = useMemo(() => {
    const floors = ['', ''], walls = ['', ''];
    for (const floor of shapes.floors) {
      floors[isSelected || selectedCellKeys?.has(floor.key) ? 1 : 0] += `${floor.d} `;
    }
    for (const wall of shapes.walls) {
      walls[isSelected || [...wall.cellKeys].some(key => selectedCellKeys?.has(key)) ? 1 : 0] += `${wall.d} `;
    }
    return { floors, walls };
  }, [shapes, isSelected, selectedCellKeys]);
  return (
    <>
      {paths.floors.map((d, selected) => d && <path key={`floor-${selected}`} data-corridor-floor="true"
        data-highlighted={Boolean(selected)} d={d.trim()} fill={selected ? '#bfdbfe' : '#e0e7ff'}
        pointerEvents={interactive ? 'fill' : 'none'} />)}
      {shapes.grid && <path data-corridor-grid="true" d={shapes.grid} fill="none"
        stroke={GRID_LINE_COLOR} strokeWidth={GRID_LINE_WIDTH} pointerEvents="none" />}
      {paths.walls.map((d, selected) => d && <path key={`wall-${selected}`} data-corridor-walls="true"
        data-highlighted={Boolean(selected)} d={d.trim()} fill="none" stroke={selected ? '#2563eb' : GRID_LINE_COLOR}
        strokeWidth={selected ? 2.5 : 2} strokeLinejoin="round" pointerEvents="none" />)}
    </>
  );
});
