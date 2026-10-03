import type { Connection, DungeonDocument, PlacedRoom } from './types';
import { normalizeConnections } from './connections';

type LegacyRoom = PlacedRoom & {
  connections?: Record<string, { roomId: string; connectorId: string }>;
};

export type DungeonDocumentInput = Omit<DungeonDocument, 'markdown' | 'connections' | 'rooms'> & {
  markdown?: string;
  connections?: Connection[];
  rooms: LegacyRoom[];
};

export function normalizeDungeonDocument(dungeon: DungeonDocumentInput): DungeonDocument {
  // Old room-local maps were unused by the editor, but migrate existing links
  // once, including reciprocal entries, rather than retaining two sources.
  const legacyConnections: Connection[] = [];
  if (dungeon.connections === undefined) {
    for (const room of dungeon.rooms) {
      for (const [connectorId, target] of Object.entries(room.connections ?? {})) {
        if (!target) continue;
        const endpoints = [[room.id, connectorId], [target.roomId, target.connectorId]].sort();
        legacyConnections.push({
          id: `legacy-${JSON.stringify(endpoints)}`,
          fromRoomId: room.id,
          fromConnectorId: connectorId,
          toRoomId: target.roomId,
          toConnectorId: target.connectorId,
          type: 'corridor',
        });
      }
    }
  }
  const rooms = dungeon.rooms.map(room => {
    const { connections: _legacy, ...placedRoom } = room;
    return placedRoom;
  });
  return {
    ...dungeon,
    rooms,
    connections: normalizeConnections(rooms, dungeon.connections ?? legacyConnections),
    markdown: dungeon.markdown ?? '',
  };
}
