import type { Connector, ConnectorDirection, ConnectorKind, PlacedRoom } from '../../model/types';
import { oppositeDirection, getWorldConnectors } from '../../utils/geometry';

export interface WorldConnector {
  roomId: string;
  connector: Connector;
  worldDirection: ConnectorDirection;
  worldPosition: { x: number; y: number };
}

/**
 * Two connectors are compatible if:
 * 1. They face opposite directions
 * 2. Their widths match
 * 3. Their kinds are compatible
 */
export function areConnectorsCompatible(a: WorldConnector, b: WorldConnector): boolean {
  const oppositeDir = oppositeDirection(a.worldDirection);
  if (b.worldDirection !== oppositeDir) return false;
  if (a.connector.width !== b.connector.width) return false;
  if (!kindsCompatible(a.connector.kind, b.connector.kind)) return false;
  return true;
}

function kindsCompatible(a: ConnectorKind, b: ConnectorKind): boolean {
  // open-to-open or door-to-door connections are straightforward.
  // door and open can join (threshold).
  // secret and locked connect only with the same kind.
  if (a === b) return true;
  if ((a === 'open' || a === 'door') && (b === 'open' || b === 'door')) return true;
  return false;
}

/**
 * Find all compatible connector pairs between two rooms.
 * Returns pairs that are also adjacent (world-grid neighbours).
 */
export function findConnectionCandidates(
  roomA: PlacedRoom,
  roomB: PlacedRoom
): Array<{ a: WorldConnector; b: WorldConnector }> {
  const consA = getWorldConnectors(roomA).map(c => ({
    roomId: roomA.id,
    connector: c as Connector,
    worldDirection: c.worldDirection,
    worldPosition: c.worldPosition,
  }));

  const consB = getWorldConnectors(roomB).map(c => ({
    roomId: roomB.id,
    connector: c as Connector,
    worldDirection: c.worldDirection,
    worldPosition: c.worldPosition,
  }));

  const results: Array<{ a: WorldConnector; b: WorldConnector }> = [];

  for (const ca of consA) {
    for (const cb of consB) {
      if (!areConnectorsCompatible(ca, cb)) continue;

      // Check adjacency: the cells must be 1 apart in the connector direction
      const dx = cb.worldPosition.x - ca.worldPosition.x;
      const dy = cb.worldPosition.y - ca.worldPosition.y;

      const adjacent =
        (ca.worldDirection === 'east'  && dx === 1 && dy === 0) ||
        (ca.worldDirection === 'west'  && dx === -1 && dy === 0) ||
        (ca.worldDirection === 'south' && dy === 1 && dx === 0) ||
        (ca.worldDirection === 'north' && dy === -1 && dx === 0);

      if (adjacent) results.push({ a: ca, b: cb });
    }
  }

  return results;
}
