import { normalizeEncounterTemplate, ENCOUNTER_LIMITS } from '../model/encounter/template';
import type { EncounterTemplate } from '../model/encounter/template';
import { rejectDuplicateJsonKeys, contentFilename } from '../content/contentJson';
import { selectionRecord } from '../model/themeSelection';

export function checkedEncounterBatch(value: unknown): EncounterTemplate[] {
  if (!Array.isArray(value) || value.length > ENCOUNTER_LIMITS.batch) throw new Error(`Encounterは一度に${ENCOUNTER_LIMITS.batch}件までです。`);
  if(new TextEncoder().encode(JSON.stringify(value)).length>ENCOUNTER_LIMITS.importBytes)throw new Error('EncounterJSONは10 MiBまでです。');
  const themes = value.map(normalizeEncounterTemplate), ids = new Set<string>();
  for (const theme of themes) { if (ids.has(theme.id)) throw new Error('入力内でEncounter IDが重複しています。'); ids.add(theme.id); }
  return themes;
}
export function buildEncounterExport(values: EncounterTemplate[], single = false) {
  const themes = checkedEncounterBatch(values);
  if (single && themes.length !== 1) throw new Error('単一出力には1Encounterを選択してください。');
  const data = single ? { schemaVersion: '1.0.0', type: 'encounter-template', template: themes[0] } : { schemaVersion: '1.0.0', type: 'encounter-template-library', templates:themes };
  if (new TextEncoder().encode(JSON.stringify(data, null, 2)).length > ENCOUNTER_LIMITS.importBytes) throw new Error('EncounterJSONは10 MiBまでです。対象を分けてください。');
  return data;
}
export function parseEncounterJson(json: string): EncounterTemplate[] {
  if (new TextEncoder().encode(json).length > ENCOUNTER_LIMITS.importBytes) throw new Error('EncounterJSONは10 MiBまでです。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('EncounterJSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  const raw = selectionRecord(value);
  if (raw.schemaVersion !== '1.0.0') throw new Error('未対応のEncounterスキーマバージョンです。');
  if (raw.type === 'encounter-template') return checkedEncounterBatch([raw.template]);
  if (raw.type === 'encounter-template-library') return checkedEncounterBatch(raw.templates);
  throw new Error('EncounterJSONのデータ種別が不正です。');
}
export const encounterFilename = (name: string) => contentFilename(name).replace(/\.content\.json$/, '.encounter.json');
