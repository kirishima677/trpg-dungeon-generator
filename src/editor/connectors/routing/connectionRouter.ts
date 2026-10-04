import type { Connection, PlacedRoom } from '../../../model/types';
import { connectionGeometry } from '../connectionGeometry';
import type { ConnectionGeometry } from '../connectionGeometry';
import { orthogonalRouter } from './orthogonalRouter';

/** Derived world-grid coordinates; never part of DungeonDocument. */
export interface RoutePoint { x: number; y: number }
export interface ConnectionRoute { points: RoutePoint[] }

export type ConnectionRouter = (geometry: ConnectionGeometry) => ConnectionRoute;

/** Geometry -> routing boundary. A future router can use the same renderer. */
export function routeConnection(
  connection: Connection,
  rooms: PlacedRoom[],
  router: ConnectionRouter = orthogonalRouter,
): ConnectionRoute | null {
  const geometry = connectionGeometry(connection, rooms);
  return geometry ? router(geometry) : null;
}
