import { emptyFactionSelection, normalizeFactionSelection } from './themeSelection';
import type { FactionSelectionPolicy } from './themeSelection';
import { v4 as uuid } from 'uuid';
import { emptyContentSelection, emptyPieceSelection, emptyRoomThemeSelection, normalizeContentSelection, normalizePieceSelection, normalizeRoomThemeSelection, selectionList, selectionRecord } from './themeSelection';
import type { ContentSelectionPolicy, PieceSelectionPolicy, RoomThemeSelectionPolicy } from './themeSelection';

export interface DungeonTheme {
  id: string; name: string; genre: string; category: string; summary: string; description: string; gmNotes: string; tags: string[];
  pieceSelection: PieceSelectionPolicy; contentSelection: ContentSelectionPolicy; createdAt: string; updatedAt: string;
  roomThemeSelection: RoomThemeSelectionPolicy; factionSelection: FactionSelectionPolicy;
}
export type DungeonThemeDraft = Omit<DungeonTheme, 'createdAt' | 'updatedAt'>;
export interface DungeonThemeAssignment { sourceThemeId: string; themeSnapshot: DungeonTheme }
export const THEME_LIMITS = { id: 128, name: 200, classification: 100, summary: 1000, markdown: 100_000, bytes: 512 * 1024, importBytes: 10 * 1024 * 1024, batch: 500 } as const;
export function themeText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${field}は${max}文字以内の${required ? '空ではない' : ''}文字列で指定してください。`);
  return value;
}
export function checkThemeSize(value: unknown) { if (new TextEncoder().encode(JSON.stringify(value)).length > THEME_LIMITS.bytes) throw new Error('テーマ定義は512 KiBまでです。'); }
/** Shared fields only: neither Room Theme constraints nor Dungeon Theme links belong here. */
export function normalizeThemeMetadata(value: unknown) {
  const raw = selectionRecord(value);
  return { id: themeText(raw.id, 'Theme ID', THEME_LIMITS.id, true), name: themeText(raw.name, 'テーマ名称', THEME_LIMITS.name, true).trim(),
    genre: themeText(raw.genre, 'ジャンル', THEME_LIMITS.classification).trim(), category: themeText(raw.category, '施設分類', THEME_LIMITS.classification).trim(),
    summary: themeText(raw.summary, 'テーマ概要', THEME_LIMITS.summary), description: themeText(raw.description, 'テーマ詳細', THEME_LIMITS.markdown), gmNotes: themeText(raw.gmNotes, 'テーマGM情報', THEME_LIMITS.markdown),
    tags: selectionList(raw.tags, 'テーマタグ') };
}
export function normalizeThemeFields(value:unknown) {
  const raw=selectionRecord(value); return {...normalizeThemeMetadata(value),pieceSelection:normalizePieceSelection(raw.pieceSelection),contentSelection:normalizeContentSelection(raw.contentSelection)};
}
export function normalizeThemeDraft(value: unknown): DungeonThemeDraft {
  const raw = selectionRecord(value), theme = { ...normalizeThemeFields(value),
    factionSelection: raw.factionSelection === undefined ? emptyFactionSelection('all') : normalizeFactionSelection(raw.factionSelection),
    roomThemeSelection: raw.roomThemeSelection === undefined ? emptyRoomThemeSelection('all') : normalizeRoomThemeSelection(raw.roomThemeSelection) };
  checkThemeSize(theme); return theme;
}
export function themeDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('テーマ日時は有効なUTC ISO日時で指定してください。');
  return value;
}
export function normalizeTheme(value: unknown): DungeonTheme {
  const draft = normalizeThemeDraft(value), raw = selectionRecord(value), createdAt = themeDate(raw.createdAt), updatedAt = themeDate(raw.updatedAt);
  if (updatedAt < createdAt) throw new Error('更新日時は作成日時以降で指定してください。');
  const theme = { ...draft, createdAt, updatedAt }; checkThemeSize(theme); return theme;
}
export function newTheme(): DungeonThemeDraft {
  return { id: uuid(), name: '', genre: '', category: '', summary: '', description: '', gmNotes: '', tags: [], pieceSelection: emptyPieceSelection(), contentSelection: emptyContentSelection(), roomThemeSelection: emptyRoomThemeSelection(), factionSelection: emptyFactionSelection() };
}
export function duplicateTheme(value: DungeonThemeDraft): DungeonThemeDraft {
  return { ...normalizeThemeDraft(value), id: uuid(), name: `${value.name}（複製）` };
}
/** Identity ignores dates and set order; unresolved IDs are preserved, never resolved during validation. */
export function sameTheme(a: DungeonTheme, b: DungeonTheme): boolean {
  const canonical = (theme: DungeonTheme) => JSON.stringify(normalizeThemeDraft(theme), (_, value) => Array.isArray(value) ? [...value].sort() : value);
  return canonical(a) === canonical(b);
}
export function normalizeThemeAssignment(value: unknown): DungeonThemeAssignment | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = selectionRecord(value), themeSnapshot = normalizeTheme(raw.themeSnapshot);
  if (raw.sourceThemeId !== themeSnapshot.id) throw new Error('元のTheme IDとスナップショットが一致しません。');
  return { sourceThemeId: themeSnapshot.id, themeSnapshot };
}
export function createThemeAssignment(theme: DungeonTheme): DungeonThemeAssignment {
  return { sourceThemeId: theme.id, themeSnapshot: normalizeTheme(theme) };
}
