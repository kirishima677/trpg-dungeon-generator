import { normalizeTheme, THEME_LIMITS } from '../model/dungeonTheme';
import type { DungeonTheme } from '../model/dungeonTheme';
import { rejectDuplicateJsonKeys, contentFilename } from '../content/contentJson';
import { selectionRecord } from '../model/themeSelection';

export function checkedThemeBatch(value: unknown): DungeonTheme[] {
  if (!Array.isArray(value) || value.length > THEME_LIMITS.batch) throw new Error(`テーマは一度に${THEME_LIMITS.batch}件までです。`);
  const themes = value.map(normalizeTheme), ids = new Set<string>();
  for (const theme of themes) { if (ids.has(theme.id)) throw new Error('入力内でTheme IDが重複しています。'); ids.add(theme.id); }
  return themes;
}
export function buildThemeExport(values: DungeonTheme[], single = false) {
  const themes = checkedThemeBatch(values);
  if (single && themes.length !== 1) throw new Error('単一出力には1テーマを選択してください。');
  const data = single ? { schemaVersion: '1.0.0', type: 'dungeon-theme', theme: themes[0] } : { schemaVersion: '1.0.0', type: 'dungeon-theme-library', themes };
  if (new TextEncoder().encode(JSON.stringify(data, null, 2)).length > THEME_LIMITS.importBytes) throw new Error('テーマJSONは10 MiBまでです。対象を分けてください。');
  return data;
}
export function parseThemeJson(json: string): DungeonTheme[] {
  if (new TextEncoder().encode(json).length > THEME_LIMITS.importBytes) throw new Error('テーマJSONは10 MiBまでです。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('テーマJSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  const raw = selectionRecord(value);
  if (raw.schemaVersion !== '1.0.0') throw new Error('未対応のテーマスキーマバージョンです。');
  if (raw.type === 'dungeon-theme') return checkedThemeBatch([raw.theme]);
  if (raw.type === 'dungeon-theme-library') return checkedThemeBatch(raw.themes);
  throw new Error('テーマJSONのデータ種別が不正です。');
}
export const themeFilename = (name: string) => contentFilename(name).replace(/\.content\.json$/, '.theme.json');
