import type { Connection, ConnectorDirection, PlacedRoom } from '../../model/types';
import { getWorldConnectors } from '../../utils/geometry';

interface WorldPoint { x: number; y: number }

/** Centre of the connector's outward cell edge, in world grid units. */
export function connectorPoint(connector: {
  worldPosition: WorldPoint;
  worldDirection: ConnectorDirection;
}): WorldPoint {
  const { x, y } = connector.worldPosition;
  const dx = connector.worldDirection === 'east' ? 0.5 : connector.worldDirection === 'west' ? -0.5 : 0;
  const dy = connector.worldDirection === 'south' ? 0.5 : connector.worldDirection === 'north' ? -0.5 : 0;
  return { x: x + 0.5 + dx, y: y + 0.5 + dy };
}

/** Derived on demand; never stored in the document or undo history. */
export function connectionEndpoints(connection: Connection, rooms: PlacedRoom[]) {
  const fromRoom = rooms.find(room => room.id === connection.fromRoomId);
  const toRoom = rooms.find(room => room.id === connection.toRoomId);
  if (!fromRoom || !toRoom) return null;
  const from = getWorldConnectors(fromRoom).find(c => c.id === connection.fromConnectorId);
  const to = getWorldConnectors(toRoom).find(c => c.id === connection.toConnectorId);
  return from && to ? { from: connectorPoint(from), to: connectorPoint(to) } : null;
}
