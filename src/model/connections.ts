import type { Connection, ConnectorEndpoint, PlacedRoom } from './types';

export function usesEndpoint(connection: Connection, endpoint: ConnectorEndpoint): boolean {
  return (connection.fromRoomId === endpoint.roomId && connection.fromConnectorId === endpoint.connectorId)
    || (connection.toRoomId === endpoint.roomId && connection.toConnectorId === endpoint.connectorId);
}

export function endpointExists(rooms: PlacedRoom[], endpoint: ConnectorEndpoint): boolean {
  return rooms.some(room => room.id === endpoint.roomId
    && room.piece.connectors.some(connector => connector.id === endpoint.connectorId));
}

/** One connection per endpoint. Manual connections need not face or touch. */
export function canConnect(
  rooms: PlacedRoom[],
  connections: Connection[],
  from: ConnectorEndpoint,
  to: ConnectorEndpoint,
): boolean {
  return from.roomId !== to.roomId
    && endpointExists(rooms, from) && endpointExists(rooms, to)
    && !connections.some(connection => usesEndpoint(connection, from) || usesEndpoint(connection, to));
}

export function isConnection(value: unknown): value is Connection {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return ['id', 'fromRoomId', 'fromConnectorId', 'toRoomId', 'toConnectorId']
    .every(key => typeof c[key] === 'string' && c[key] !== '')
    && ['corridor', 'door', 'stairs', 'secret'].includes(c.type as string);
}

/** Keep only valid logical data, never derived coordinates or SVG properties. */
export function normalizeConnections(rooms: PlacedRoom[], candidates: unknown[]): Connection[] {
  const result: Connection[] = [];
  for (const candidate of candidates) {
    if (!isConnection(candidate) || result.some(c => c.id === candidate.id)) continue;
    const { id, fromRoomId, fromConnectorId, toRoomId, toConnectorId, type } = candidate;
    if (!canConnect(rooms, result,
      { roomId: fromRoomId, connectorId: fromConnectorId },
      { roomId: toRoomId, connectorId: toConnectorId })) continue;
    result.push({ id, fromRoomId, fromConnectorId, toRoomId, toConnectorId, type });
  }
  return result;
}
