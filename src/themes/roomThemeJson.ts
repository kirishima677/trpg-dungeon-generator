import { normalizeRoomTheme, ROOM_THEME_LIMITS } from '../model/roomTheme';
import type { RoomTheme } from '../model/roomTheme';
import { rejectDuplicateJsonKeys, contentFilename } from '../content/contentJson';
import { selectionRecord } from '../model/themeSelection';

export function checkedRoomThemeBatch(value: unknown): RoomTheme[] {
  if (!Array.isArray(value) || value.length > ROOM_THEME_LIMITS.batch) throw new Error(`テーマは一度に${ROOM_THEME_LIMITS.batch}件までです。`);
  const themes = value.map(normalizeRoomTheme), ids = new Set<string>();
  for (const theme of themes) { if (ids.has(theme.id)) throw new Error('入力内でTheme IDが重複しています。'); ids.add(theme.id); }
  return themes;
}
export function buildRoomThemeExport(values: RoomTheme[], single = false) {
  const themes = checkedRoomThemeBatch(values);
  if (single && themes.length !== 1) throw new Error('単一出力には1テーマを選択してください。');
  const data = single ? { schemaVersion: '1.0.0', type: 'room-theme', theme: themes[0] } : { schemaVersion: '1.0.0', type: 'room-theme-library', themes };
  if (new TextEncoder().encode(JSON.stringify(data, null, 2)).length > ROOM_THEME_LIMITS.importBytes) throw new Error('テーマJSONは10 MiBまでです。対象を分けてください。');
  return data;
}
export function parseRoomThemeJson(json: string): RoomTheme[] {
  if (new TextEncoder().encode(json).length > ROOM_THEME_LIMITS.importBytes) throw new Error('テーマJSONは10 MiBまでです。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('テーマJSONの構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  const raw = selectionRecord(value);
  if (raw.schemaVersion !== '1.0.0') throw new Error('未対応のテーマスキーマバージョンです。');
  if (raw.type === 'room-theme') return checkedRoomThemeBatch([raw.theme]);
  if (raw.type === 'room-theme-library') return checkedRoomThemeBatch(raw.themes);
  throw new Error('テーマJSONのデータ種別が不正です。');
}
export const roomThemeFilename = (name: string) => contentFilename(name).replace(/\.content\.json$/, '.room-theme.json');
