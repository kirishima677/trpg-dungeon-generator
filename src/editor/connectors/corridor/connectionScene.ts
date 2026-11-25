import type { Connection, PlacedRoom } from '../../../model/types';
import { connectionGeometry } from '../connectionGeometry';
import type { OccupancyGrid } from '../routing/occupancyGrid';
import type { RoutingResult } from '../routing/types';
import { generateCorridorCells } from './corridorGeometry';
import type { CorridorGeometryResult } from './corridorGeometry';
import { buildCorridorNetwork } from './corridorNetwork';
import type { CorridorNetwork } from './corridorNetwork';
import { createOccupancyGrid } from '../routing/occupancyGrid';
import { routeConnections } from '../routing/connectionRouter';

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

/** Metadata and history clones do not invalidate the physical routing pipeline. */
export function createConnectionSceneResolver() {
  let previousLayout = '', previousConnections = '';
  let grid: OccupancyGrid | undefined, scene: ConnectionScene | undefined;
  return (rooms: PlacedRoom[], connections: Connection[]): ConnectionScene => {
    const layout = JSON.stringify(rooms.map(r => [r.id, r.position.x, r.position.y, r.rotation,
      r.piece.cells.map(c => [c.x, c.y]), r.piece.connectors.map(c => [c.id, c.position.x, c.position.y, c.direction, c.width, c.kind])]));
    const links = JSON.stringify(connections.map(c => [c.id, c.fromRoomId, c.fromConnectorId, c.toRoomId, c.toConnectorId, c.type]));
    if (scene && layout === previousLayout && links === previousConnections) return scene;
    if (!grid || layout !== previousLayout) grid = createOccupancyGrid(rooms);
    const results = routeConnections(connections, rooms, grid);
    scene = prepareConnectionScene(connections, rooms, results, grid, scene?.cache);
    previousLayout = layout; previousConnections = links;
    return scene;
  };
}
