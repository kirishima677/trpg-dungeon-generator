import type { DungeonDocument, ExportEnvelope } from '../model/types';
import { normalizeDungeonDocument } from '../model/normalizeDungeon';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import { normalizeConnections } from '../model/connections';
import { isStandardPiece, normalizePiece, pieceStructure } from '../editor/pieces/pieceDefinition';
import { DEFAULT_PIECES } from '../model/pieceLibrary';
import { SCHEMA_VERSION, SUPPORTED_DUNGEON_SCHEMAS } from '../model/dungeonSchema';
import { roomInformationError } from '../model/roomInformation';
import { ENTITY_LIMITS } from '../model/entity';
import { rejectDuplicateJsonKeys } from '../content/contentJson';

export { SCHEMA_VERSION };
export const FORMAT_ID = 'trpg-dungeon-generator' as const;

export function buildExportEnvelope(dungeon: DungeonDocument): ExportEnvelope {
  const envelope: ExportEnvelope = {
    formatId: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dungeon: { ...normalizeDungeonDocument(dungeon), version: SCHEMA_VERSION },
  };
  if (new TextEncoder().encode(JSON.stringify(envelope, null, 2)).length > ENTITY_LIMITS.dungeonJsonBytes) throw new Error('Dungeon JSONは20 MiBまでです。');
  return envelope;
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
  if (new TextEncoder().encode(JSON.stringify(raw)).length > ENTITY_LIMITS.dungeonJsonBytes) throw new Error('Dungeon JSONは20 MiBまでです。');
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as Record<string, unknown>).formatId !== FORMAT_ID
  ) {
    throw new Error('Invalid dungeon file: formatId mismatch');
  }
  const envelope = raw as Record<string, unknown>;
  if (typeof envelope.schemaVersion !== 'string' || !SUPPORTED_DUNGEON_SCHEMAS.includes(envelope.schemaVersion)) {
    throw new Error('Unsupported dungeon schema version');
  }
  const dungeon = envelope.dungeon as DungeonDocumentInput;
  if (!dungeon || typeof dungeon.id !== 'string' || typeof dungeon.name !== 'string'
    || !Array.isArray(dungeon.rooms) || !dungeon.meta || !Number.isFinite(dungeon.meta.gridSize)
    || (dungeon.markdown !== undefined && typeof dungeon.markdown !== 'string')) {
    throw new Error('Invalid dungeon document');
  }
  if(envelope.schemaVersion===SCHEMA_VERSION&&['factions','factionRelations','roomFactionAssignments'].some(k=>!Array.isArray((dungeon as unknown as Record<string,unknown>)[k])))throw new Error('Faction配列が不足しています。');
  const roomIds = new Set<string>();
  const pieceDefinitions = new Map<string, string>();
  const roomNumbers = new Set<string>();
  for (const room of dungeon.rooms) {
    if (!room || typeof room.id !== 'string' || roomIds.has(room.id)
      || !room.position || !Number.isFinite(room.position.x) || !Number.isFinite(room.position.y)
      || ![0, 90, 180, 270].includes(room.rotation)
      || !room.piece || !Array.isArray(room.piece.cells) || room.piece.cells.length === 0
      || !Array.isArray(room.piece.connectors)) throw new Error('Invalid room');
    roomIds.add(room.id);
    if (['1.2.0', '1.3.0', '1.4.0', '1.5.0', SCHEMA_VERSION].includes(envelope.schemaVersion)) {
      const error = roomInformationError(room.information, roomNumbers);
      if (error) throw new Error(`Invalid room information: ${error}`);
      roomNumbers.add(room.information!.number.trim());
    }
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
    if (room.pieceId !== room.piece.id) throw new Error('Invalid piece reference');
    if (isStandardPiece(room.pieceId)) {
      const standard = DEFAULT_PIECES.find(p => p.id === room.pieceId)!;
      if (pieceStructure(room.piece) !== pieceStructure(standard)) throw new Error('Invalid standard piece definition');
    } else {
      const piece = normalizePiece(room.piece), signature = pieceStructure(piece);
      if (pieceDefinitions.has(piece.id) && pieceDefinitions.get(piece.id) !== signature) throw new Error('Conflicting piece definitions');
      pieceDefinitions.set(piece.id, signature);
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

export function parseDungeonJson(json: string): ExportEnvelope {
  if (new TextEncoder().encode(json).length > ENTITY_LIMITS.dungeonJsonBytes) throw new Error('Dungeon JSONは20 MiBまでです。');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Dungeon JSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  return parseImport(raw);
}
