import { normalizeFaction, FACTION_LIMITS } from '../model/faction';
import type { FactionDefinition } from '../model/faction';
import { rejectDuplicateJsonKeys, contentFilename } from '../content/contentJson';
import { selectionRecord } from '../model/themeSelection';

export function checkedFactionBatch(value: unknown): FactionDefinition[] {
  if (!Array.isArray(value) || value.length > FACTION_LIMITS.batch) throw new Error(`勢力は一度に${FACTION_LIMITS.batch}件までです。`);
  if(new TextEncoder().encode(JSON.stringify(value)).length>FACTION_LIMITS.importBytes)throw new Error('勢力JSONは10 MiBまでです。');
  const themes = value.map(normalizeFaction), ids = new Set<string>();
  for (const theme of themes) { if (ids.has(theme.id)) throw new Error('入力内でFaction IDが重複しています。'); ids.add(theme.id); }
  return themes;
}
export function buildFactionExport(values: FactionDefinition[], single = false) {
  const themes = checkedFactionBatch(values);
  if (single && themes.length !== 1) throw new Error('単一出力には1勢力を選択してください。');
  const data = single ? { schemaVersion: '1.0.0', type: 'faction-definition', faction: themes[0] } : { schemaVersion: '1.0.0', type: 'faction-library', factions:themes };
  if (new TextEncoder().encode(JSON.stringify(data, null, 2)).length > FACTION_LIMITS.importBytes) throw new Error('勢力JSONは10 MiBまでです。対象を分けてください。');
  return data;
}
export function parseFactionJson(json: string): FactionDefinition[] {
  if (new TextEncoder().encode(json).length > FACTION_LIMITS.importBytes) throw new Error('勢力JSONは10 MiBまでです。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('勢力JSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  const raw = selectionRecord(value);
  if (raw.schemaVersion !== '1.0.0') throw new Error('未対応の勢力スキーマバージョンです。');
  if (raw.type === 'faction-definition') return checkedFactionBatch([raw.faction]);
  if (raw.type === 'faction-library') return checkedFactionBatch(raw.factions);
  throw new Error('勢力JSONのデータ種別が不正です。');
}
export const factionFilename = (name: string) => contentFilename(name).replace(/\.content\.json$/, '.faction.json');
