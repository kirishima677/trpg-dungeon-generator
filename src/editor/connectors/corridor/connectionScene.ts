import type { Connection, PlacedRoom } from '../../../model/types';
import { connectionGeometry } from '../connectionGeometry';
import type { OccupancyGrid } from '../routing/occupancyGrid';
import type { RoutingResult } from '../routing/types';
import { generateCorridorCells } from './corridorGeometry';
import type { CorridorGeometryResult } from './corridorGeometry';
import { buildCorridorNetwork } from './corridorNetwork';
import type { CorridorNetwork } from './corridorNetwork';

export const MAX_TOTAL_CORRIDOR_CELLS = 16_384;

export interface ConnectionDrawing {
  connection: Connection;
  result: RoutingResult;
  corridor?: CorridorGeometryResult;
}
export interface CachedCorridor {
  signature: string;
  corridor: Extract<CorridorGeometryResult, { status: 'success' }>;
}
export interface ConnectionScene {
  drawings: ConnectionDrawing[];
  openConnectorIds: Map<string, Set<string>>;
  cache: Map<string, CachedCorridor>;
  network: CorridorNetwork;
}

/** Cache logical contributions, then derive the physical network separately. */
export function prepareConnectionScene(
  connections: Connection[], rooms: PlacedRoom[], results: ReadonlyMap<string, RoutingResult>,
  grid: OccupancyGrid, previous: ReadonlyMap<string, CachedCorridor> = new Map(),
): ConnectionScene {
  const drawings: ConnectionDrawing[] = [];
  const openConnectorIds = new Map<string, Set<string>>();
  const cache = new Map<string, CachedCorridor>();
  let remaining = MAX_TOTAL_CORRIDOR_CELLS;
  const open = (roomId: string, connectorId: string) => {
    if (!openConnectorIds.has(roomId)) openConnectorIds.set(roomId, new Set());
    openConnectorIds.get(roomId)!.add(connectorId);
  };
  // Stable budget priority also keeps overflow behaviour independent of input order.
  for (const connection of [...connections].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const result = results.get(connection.id);
    if (!result) continue;
    const drawing: ConnectionDrawing = { connection, result };
    if (connection.type === 'corridor' && result.status === 'success') {
      const geometry = connectionGeometry(connection, rooms);
      if (geometry) {
        const signature = JSON.stringify([result.route.points, geometry]);
        const cached = previous.get(connection.id);
        drawing.corridor = cached?.signature === signature && cached.corridor.cells.length <= remaining
          && cached.corridor.cells.every(cell => !grid.isOccupied(cell))
          ? cached.corridor : generateCorridorCells(result.route, geometry, grid, remaining);
        if (drawing.corridor.status === 'success') {
          remaining -= drawing.corridor.cells.length;
          cache.set(connection.id, { signature, corridor: drawing.corridor });
          open(connection.fromRoomId, connection.fromConnectorId);
          open(connection.toRoomId, connection.toConnectorId);
        }
      }
    }
    drawings.push(drawing);
  }
  const network = buildCorridorNetwork(drawings.flatMap(drawing =>
    drawing.result.status === 'success' && drawing.corridor?.status === 'success'
      ? [{ connectionId: drawing.connection.id, type: drawing.connection.type, cells: drawing.corridor.cells }] : []));
  return { drawings, openConnectorIds, cache, network };
}
