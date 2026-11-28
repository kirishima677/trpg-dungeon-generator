import type { DungeonDocument, ExportEnvelope } from '../model/types';
import { assertDungeonDocument } from '../model/dungeonValidation';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import { SCHEMA_VERSION, SUPPORTED_DUNGEON_SCHEMAS } from '../model/dungeonSchema';
import { ENTITY_LIMITS } from '../model/entity';
import { rejectDuplicateJsonKeys } from '../content/contentJson';

export { SCHEMA_VERSION };
export const FORMAT_ID = 'trpg-dungeon-generator' as const;

export function buildExportEnvelope(dungeon: DungeonDocument): ExportEnvelope {
  const envelope: ExportEnvelope = {
    formatId: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dungeon: { ...assertDungeonDocument(dungeon), version: SCHEMA_VERSION },
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
  if(['1.6.0',SCHEMA_VERSION].includes(envelope.schemaVersion)&&['factions','factionRelations','roomFactionAssignments'].some(k=>!Array.isArray((dungeon as unknown as Record<string,unknown>)[k])))throw new Error('Faction配列が不足しています。');
  if(envelope.schemaVersion===SCHEMA_VERSION&&!Array.isArray(dungeon.encounters))throw new Error('Encounter配列が不足しています。');
  const document = assertDungeonDocument(dungeon, { requireRoomInformation: !['1.0.0','1.1.0'].includes(envelope.schemaVersion) });
  return {
    formatId: FORMAT_ID,
    schemaVersion: envelope.schemaVersion,
    exportedAt: envelope.exportedAt as string,
    dungeon: document,
  };
}

export function parseDungeonJson(json: string): ExportEnvelope {
  if (new TextEncoder().encode(json).length > ENTITY_LIMITS.dungeonJsonBytes) throw new Error('Dungeon JSONは20 MiBまでです。');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Dungeon JSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  return parseImport(raw);
}
