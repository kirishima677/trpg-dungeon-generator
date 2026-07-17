import type { PlacedRoom } from '../../model/types';
import { getWorldCells } from '../../utils/geometry';

/**
 * Returns true if `incoming` collides with any room in `existing`.
 * `excludeId` can be used to skip self-check when moving a placed room.
 */
export function detectCollision(
  incoming: PlacedRoom,
  existing: PlacedRoom[],
  excludeId?: string
): boolean {
  const newCells = getWorldCells(incoming);
  const occupied = new Set(
    existing
      .filter(r => r.id !== excludeId)
      .flatMap(r => getWorldCells(r))
      .map(c => `${c.x},${c.y}`)
  );
  return newCells.some(c => occupied.has(`${c.x},${c.y}`));
}
