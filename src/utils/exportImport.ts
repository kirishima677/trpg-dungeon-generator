import type { DungeonDocument, ExportEnvelope } from '../model/types';

export const SCHEMA_VERSION = '1.0.0';
export const FORMAT_ID = 'trpg-dungeon-generator' as const;

export function buildExportEnvelope(dungeon: DungeonDocument): ExportEnvelope {
  return {
    formatId: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dungeon,
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
  return raw as ExportEnvelope;
}
