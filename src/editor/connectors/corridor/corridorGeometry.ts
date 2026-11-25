import { connectorOutsideCell } from '../connectionGeometry';
import type { ConnectionGeometry } from '../connectionGeometry';
import type { ConnectionRoute, GridPosition } from '../routing/types';
import type { OccupancyGrid } from '../routing/occupancyGrid';
import { isCellCenteredRoute, isDirectConnection, simplifyRoutePoints } from '../routing/routeUtils';
import { oppositeDirection } from '../../../utils/geometry';
import { DIRECTION_BITS, EAST, NORTH, SOUTH, WEST } from './directions';

export interface CorridorCell extends GridPosition { connections: number }
export type CorridorGeometryResult =
  | { status: 'success'; cells: CorridorCell[] }
  | { status: 'invalid-route' | 'limit-exceeded' };

/** Also caps expansion work for paths with repeated cells, not just unique cells. */
export const MAX_CORRIDOR_CELLS = 4096;

/** Pure, per-Connection geometry. No SVG, React, or persistence dependencies. */
export function generateCorridorCells(
  route: ConnectionRoute, geometry: ConnectionGeometry, grid: OccupancyGrid, maxCells = MAX_CORRIDOR_CELLS,
): CorridorGeometryResult {
  if (isDirectConnection(geometry) && route.points.length > 0
    && route.points.every(p => p.x === geometry.from.position.x && p.y === geometry.from.position.y)) {
    return { status: 'success', cells: [] };
  }
  if (!isCellCenteredRoute(route, geometry)) return { status: 'invalid-route' };
  const points = simplifyRoutePoints(route.points);
  const start = connectorOutsideCell(geometry.from), goal = connectorOutsideCell(geometry.to);
  // Replace only the edge-to-centre stubs, never round the actual anchors.
  const centers = simplifyRoutePoints([
    { x: start.x + 0.5, y: start.y + 0.5 }, ...points.slice(1, -1),
    { x: goal.x + 0.5, y: goal.y + 0.5 },
  ]);
  const waypoints = centers.map(p => ({ x: p.x - 0.5, y: p.y - 0.5 }));
  const limit = Number.isFinite(maxCells)
    ? Math.min(MAX_CORRIDOR_CELLS, Math.max(0, Math.floor(maxCells))) : MAX_CORRIDOR_CELLS;
  let work = 1;
  if (work > limit) return { status: 'limit-exceeded' };
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    if (a.x !== b.x && a.y !== b.y) return { status: 'invalid-route' };
    work += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (work > limit) return { status: 'limit-exceeded' };
  }

  const cells = new Map<string, CorridorCell>();
  const visit = (p: GridPosition): CorridorCell | null => {
    if (grid.isOccupied(p)) return null;
    const key = `${p.x},${p.y}`;
    if (!cells.has(key)) cells.set(key, { ...p, connections: 0 });
    return cells.get(key)!;
  };
  let previous = visit(start);
  if (!previous) return { status: 'invalid-route' };
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1], to = waypoints[i];
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    const forward = dx > 0 ? EAST : dx < 0 ? WEST : dy > 0 ? SOUTH : NORTH;
    const backward = dx > 0 ? WEST : dx < 0 ? EAST : dy > 0 ? NORTH : SOUTH;
    let x = from.x, y = from.y;
    while (x !== to.x || y !== to.y) {
      x += dx; y += dy;
      const cell = visit({ x, y });
      if (!cell) return { status: 'invalid-route' };
      previous.connections |= forward;
      cell.connections |= backward;
      previous = cell;
    }
  }
  cells.get(`${start.x},${start.y}`)!.connections |= DIRECTION_BITS[oppositeDirection(geometry.from.direction)];
  cells.get(`${goal.x},${goal.y}`)!.connections |= DIRECTION_BITS[oppositeDirection(geometry.to.direction)];
  return { status: 'success', cells: [...cells.values()] };
}
