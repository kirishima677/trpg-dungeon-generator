import type { CorridorCell } from './corridorGeometry';
import { EAST, NORTH, SOUTH, WEST } from './directions';

export interface WallSegment { x1: number; y1: number; x2: number; y2: number }

/** Grid-space edges; only closed sides become walls. Supports all 15 masks. */
export function corridorWalls(cell: CorridorCell): WallSegment[] {
  const { x, y, connections } = cell;
  const walls: WallSegment[] = [];
  if (!(connections & NORTH)) walls.push({ x1: x, y1: y, x2: x + 1, y2: y });
  if (!(connections & EAST)) walls.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
  if (!(connections & SOUTH)) walls.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
  if (!(connections & WEST)) walls.push({ x1: x, y1: y, x2: x, y2: y + 1 });
  return walls;
}
