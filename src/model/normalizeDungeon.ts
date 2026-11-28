import { normalizeFactionState } from './factionState';
import type { Connection, DungeonDocument, PlacedRoomInput } from './types';
import { normalizeConnections } from './connections';
import { normalizeRoomInformationList } from './roomInformation';
import { SCHEMA_VERSION } from './dungeonSchema';
import { normalizeEntities } from './entity';
import { normalizeThemeAssignment } from './dungeonTheme';
import { normalizeRoomThemeAssignment } from './roomTheme';

type LegacyRoom = PlacedRoomInput & {
  connections?: Record<string, { roomId: string; connectorId: string }>;
};

export type DungeonDocumentInput = Omit<DungeonDocument, 'markdown' | 'connections' | 'rooms' | 'entities' | 'factions' | 'factionRelations' | 'roomFactionAssignments'> & {
  markdown?: string;
  connections?: Connection[];
  rooms: LegacyRoom[];
  entities?: DungeonDocument['entities'];
  factions?: DungeonDocument['factions']; factionRelations?: DungeonDocument['factionRelations']; roomFactionAssignments?: DungeonDocument['roomFactionAssignments'];
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
  const rooms = normalizeRoomInformationList(dungeon.rooms.map(room => {
    const { connections: _legacy, roomTheme: rawTheme, ...placedRoom } = room;
    const roomTheme = normalizeRoomThemeAssignment(rawTheme);
    return { ...placedRoom, ...(roomTheme ? { roomTheme } : {}) };
  }));
  const { theme: rawTheme, ...base } = dungeon;
  const theme = normalizeThemeAssignment(rawTheme);
  const entities = normalizeEntities(dungeon.entities,rooms);
  const factionState=normalizeFactionState(dungeon,rooms,entities);
  return {
    ...base,
    ...factionState,
    version: SCHEMA_VERSION,
    rooms,
    connections: normalizeConnections(rooms, dungeon.connections ?? legacyConnections),
    markdown: dungeon.markdown ?? '',
    entities,
    ...(theme ? { theme } : {}),
  };
}
