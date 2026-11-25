import type { Connection, PlacedRoom } from '../../../model/types';
import { connectionGeometry } from '../connectionGeometry';
import type { ConnectionGeometry } from '../connectionGeometry';
import { createOccupancyGrid } from './occupancyGrid';
import type { OccupancyGrid } from './occupancyGrid';
import { obstacleAvoidingRouter } from './obstacleAvoidingRouter';
import type { ConnectionRoute, RoutingResult } from './types';

export type { ConnectionRoute, RoutePoint, RoutingResult } from './types';

export type ConnectionRouter = (geometry: ConnectionGeometry) => ConnectionRoute;

/** Geometry -> routing boundary. A future router can use the same renderer. */
export function routeConnection(
  connection: Connection,
  rooms: PlacedRoom[],
  router?: ConnectionRouter,
): ConnectionRoute | null {
  if (!router) {
    const result = resolveConnectionRoute(connection, rooms);
    return result.status === 'success' ? result.route : null;
  }
  const geometry = connectionGeometry(connection, rooms);
  return geometry ? router(geometry) : null;
}

export function resolveConnectionRoute(
  connection: Connection, rooms: PlacedRoom[], grid: OccupancyGrid = createOccupancyGrid(rooms),
): RoutingResult {
  const geometry = connectionGeometry(connection, rooms);
  return geometry ? obstacleAvoidingRouter(geometry, grid) : { status: 'invalid', route: null };
}

/** One shared occupancy grid per room layout, not one per connection. */
export function routeConnections(
  connections: Connection[], rooms: PlacedRoom[], grid: OccupancyGrid = createOccupancyGrid(rooms),
): Map<string, RoutingResult> {
  return new Map(connections.map(connection => [connection.id, resolveConnectionRoute(connection, rooms, grid)]));
}
