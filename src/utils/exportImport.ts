import type { DungeonDocument, ExportEnvelope } from '../model/types';
import { normalizeDungeonDocument } from '../model/normalizeDungeon';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import { normalizeConnections } from '../model/connections';

export const SCHEMA_VERSION = '1.1.0';
export const FORMAT_ID = 'trpg-dungeon-generator' as const;

export function buildExportEnvelope(dungeon: DungeonDocument): ExportEnvelope {
  return {
    formatId: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dungeon: { ...normalizeDungeonDocument(dungeon), version: SCHEMA_VERSION },
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Returns the parsed envelope or throws if invalid */
export function parseImport(raw: unknown): ExportEnvelope {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as Record<string, unknown>).formatId !== FORMAT_ID
  ) {
    throw new Error('Invalid dungeon file: formatId mismatch');
  }
  const envelope = raw as Record<string, unknown>;
  if (envelope.schemaVersion !== '1.0.0' && envelope.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported dungeon schema version');
  }
  const dungeon = envelope.dungeon as DungeonDocumentInput;
  if (!dungeon || typeof dungeon.id !== 'string' || typeof dungeon.name !== 'string'
    || !Array.isArray(dungeon.rooms) || !dungeon.meta || !Number.isFinite(dungeon.meta.gridSize)
    || (dungeon.markdown !== undefined && typeof dungeon.markdown !== 'string')) {
    throw new Error('Invalid dungeon document');
  }
  const roomIds = new Set<string>();
  for (const room of dungeon.rooms) {
    if (!room || typeof room.id !== 'string' || roomIds.has(room.id)
      || !room.position || !Number.isFinite(room.position.x) || !Number.isFinite(room.position.y)
      || ![0, 90, 180, 270].includes(room.rotation)
      || !room.piece || !Array.isArray(room.piece.cells) || room.piece.cells.length === 0
      || !Array.isArray(room.piece.connectors)) throw new Error('Invalid room');
    roomIds.add(room.id);
    const connectorIds = new Set<string>();
    for (const cell of room.piece.cells) {
      if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) throw new Error('Invalid room cell');
    }
    for (const connector of room.piece.connectors) {
      if (!connector || typeof connector.id !== 'string' || connectorIds.has(connector.id)
        || !connector.position || !Number.isFinite(connector.position.x) || !Number.isFinite(connector.position.y)
        || !['north', 'east', 'south', 'west'].includes(connector.direction)) throw new Error('Invalid connector');
      connectorIds.add(connector.id);
    }
  }
  if (dungeon.connections !== undefined
    && (!Array.isArray(dungeon.connections)
      || normalizeConnections(dungeon.rooms, dungeon.connections).length !== dungeon.connections.length)) {
    throw new Error('Invalid connections: missing reference, duplicate endpoint or invalid type');
  }
  return {
    formatId: FORMAT_ID,
    schemaVersion: envelope.schemaVersion,
    exportedAt: envelope.exportedAt as string,
    dungeon: { ...normalizeDungeonDocument(dungeon), version: SCHEMA_VERSION },
  };
}
