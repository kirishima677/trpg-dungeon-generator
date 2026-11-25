import { connectorOutsideCell } from '../connectionGeometry';
import type { ConnectionGeometry } from '../connectionGeometry';
import type { ConnectionRoute, RoutingResult } from './types';
import { aStarRoute } from './aStarRouter';
import type { SearchOptions } from './aStarRouter';
import { isRouteClear } from './occupancyGrid';
import type { OccupancyGrid } from './occupancyGrid';
import { orthogonalRouter } from './orthogonalRouter';
import { isCellCenteredRoute, isDirectConnection, simplifyRoutePoints } from './routeUtils';

/** Retain clear orthogonal routes; otherwise search between exterior cells. */
export function obstacleAvoidingRouter(
  geometry: ConnectionGeometry, grid: OccupancyGrid, options: SearchOptions = {},
): RoutingResult {
  if (isDirectConnection(geometry)) {
    return { status: 'success', route: { points: [{ ...geometry.from.position }] }, method: 'direct' };
  }
  const fallback = orthogonalRouter(geometry);
  const start = connectorOutsideCell(geometry.from), goal = connectorOutsideCell(geometry.to);
  if (grid.isOccupied(start) || grid.isOccupied(goal)) return { status: 'unreachable', fallback };
  if (isCellCenteredRoute(fallback, geometry) && isRouteClear(fallback, grid)) {
    return { status: 'success', route: fallback, method: 'orthogonal' };
  }
  const search = aStarRoute(start, goal, grid, options);
  if (search.status !== 'success') return { status: search.status, fallback };
  const route: ConnectionRoute = {
    points: simplifyRoutePoints([
      geometry.from.position,
      ...search.cells.map(cell => ({ x: cell.x + 0.5, y: cell.y + 0.5 })),
      geometry.to.position,
    ]),
  };
  // Validate the full route, including the connector-to-cell stubs, rather
  // than assuming an arbitrary imported connector lies on a valid grid edge.
  return isCellCenteredRoute(route, geometry) && isRouteClear(route, grid)
    ? { status: 'success', route, method: 'a-star' }
    : { status: 'unreachable', fallback };
}
