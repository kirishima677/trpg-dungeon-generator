import { GRID_SIZE } from '../../grid';
import type { CorridorCell } from './corridorGeometry';
import { corridorWalls } from './corridorShape';

/** Shared, non-interactive floor/grid/wall paths in editor SVG units. */
export function cellShapes(cells: readonly CorridorCell[]) {
  const walls = new Map<string, { d: string; cellKeys: Set<string> }>();
  const boundaries = new Map<string, string>();
  const floors = cells.map(cell => {
    const key = `${cell.x},${cell.y}`;
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
  const grid = [...boundaries].filter(([key]) => !walls.has(key)).map(([, d]) => d).join(' ');
  return { floors, grid, walls: [...walls.values()] };
}
