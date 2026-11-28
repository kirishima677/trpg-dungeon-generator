import { v4 as uuid } from 'uuid';
import type { DungeonTheme } from './dungeonTheme';
import { newTheme, normalizeThemeFields, THEME_LIMITS, themeText, themeDate, checkThemeSize } from './dungeonTheme';
import { selectionRecord } from './themeSelection';
import { CONTENT_KINDS } from './content';
import type { ContentKind } from './content';
import type { EntityEdits } from './entity';
import { normalizeEntityEdits, ENTITY_LIMITS } from './entity';

export const ROOM_THEME_LIMITS = { ...THEME_LIMITS, purpose: 1000, required: 50, structure: 1_000_000, batchEntities: ENTITY_LIMITS.perRoom } as const;
export const ROOM_CONSTRAINT_FIELDS = ['minCells', 'maxCells', 'minConnectors', 'maxConnectors', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const;
export type RoomPieceConstraints = Partial<Record<typeof ROOM_CONSTRAINT_FIELDS[number], number>>;
export interface RequiredContentEntry extends EntityEdits { id: string; contentId: string; expectedKind: ContentKind }
export interface RoomTheme extends Omit<DungeonTheme, 'roomThemeSelection' | 'factionSelection'> {
  purpose: string; pieceConstraints: RoomPieceConstraints; requiredContents: RequiredContentEntry[];
}
export type RoomThemeDraft = Omit<RoomTheme, 'createdAt' | 'updatedAt'>;
export interface RoomThemeAssignment { sourceThemeId: string; themeSnapshot: RoomTheme }
export function normalizeRoomConstraints(value: unknown): RoomPieceConstraints {
  const raw = selectionRecord(value), constraints: RoomPieceConstraints = {};
  if (Object.keys(raw).some(k => !ROOM_CONSTRAINT_FIELDS.includes(k as typeof ROOM_CONSTRAINT_FIELDS[number]))) throw new Error('未知のPiece構造条件です。');
  for (const field of ROOM_CONSTRAINT_FIELDS) if (raw[field] !== undefined) {
    const v = raw[field], minimum = field.endsWith('Connectors') ? 0 : 1;
    if (!Number.isSafeInteger(v) || (v as number) < minimum || (v as number) > ROOM_THEME_LIMITS.structure) throw new Error(`${field}は${minimum}〜${ROOM_THEME_LIMITS.structure}の整数で指定してください。`);
    constraints[field] = v as number;
  }
  for (const [min, max] of [['minCells','maxCells'],['minConnectors','maxConnectors'],['minWidth','maxWidth'],['minHeight','maxHeight']] as const)
    if (constraints[min] !== undefined && constraints[max] !== undefined && constraints[min]! > constraints[max]!) throw new Error(`${min}は${max}以下で指定してください。`);
  return constraints;
}
export function normalizeRequiredEntry(value: unknown): RequiredContentEntry {
  const raw = selectionRecord(value);
  if (!CONTENT_KINDS.includes(raw.expectedKind as ContentKind)) throw new Error('必須Contentの想定種別が不正です。');
  return { id: themeText(raw.id, '必須構成項目ID', 128, true), contentId: themeText(raw.contentId, '必須Content ID', 128, true), expectedKind: raw.expectedKind as ContentKind, ...normalizeEntityEdits(raw) };
}
export function normalizeRoomThemeDraft(value: unknown): RoomThemeDraft {
  const raw = selectionRecord(value);
  if (!Array.isArray(raw.requiredContents) || raw.requiredContents.length > ROOM_THEME_LIMITS.required) throw new Error(`必須構成は${ROOM_THEME_LIMITS.required}件までです。`);
  const requiredContents = raw.requiredContents.map(normalizeRequiredEntry), ids = new Set<string>();
  for (const entry of requiredContents) { if (ids.has(entry.id)) throw new Error('必須構成項目IDが重複しています。'); ids.add(entry.id); }
  const theme = { ...normalizeThemeFields(value), purpose: themeText(raw.purpose, '部屋の用途', ROOM_THEME_LIMITS.purpose), pieceConstraints: normalizeRoomConstraints(raw.pieceConstraints), requiredContents };
  checkThemeSize(theme); return theme;
}
export function normalizeRoomTheme(value: unknown): RoomTheme {
  const draft = normalizeRoomThemeDraft(value), raw = selectionRecord(value), createdAt = themeDate(raw.createdAt), updatedAt = themeDate(raw.updatedAt);
  if (updatedAt < createdAt) throw new Error('更新日時は作成日時以降で指定してください。');
  const theme = { ...draft, createdAt, updatedAt }; checkThemeSize(theme); return theme;
}
export function newRoomTheme(): RoomThemeDraft {
  const { roomThemeSelection: _dungeonOnly, factionSelection: _factions, ...base } = newTheme();
  return { ...base, purpose: '', pieceConstraints: {}, requiredContents: [] };
}
export function duplicateRoomTheme(value: RoomThemeDraft): RoomThemeDraft {
  const draft = normalizeRoomThemeDraft(value);
  return { ...draft, id: uuid(), name: `${draft.name}（複製）`, requiredContents: draft.requiredContents.map(e => ({ ...e, id: uuid() })) };
}
export function sameRoomTheme(a: RoomTheme, b: RoomTheme): boolean {
  const canonical = (theme: RoomTheme) => {
    const draft = normalizeRoomThemeDraft(theme);
    return JSON.stringify({ ...draft, requiredContents: draft.requiredContents.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }, (_,v) => Array.isArray(v) && v.every(x => typeof x === 'string') ? [...v].sort() : v);
  };
  return canonical(a) === canonical(b);
}
export function normalizeRoomThemeAssignment(value: unknown): RoomThemeAssignment | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = selectionRecord(value), themeSnapshot = normalizeRoomTheme(raw.themeSnapshot);
  if (raw.sourceThemeId !== themeSnapshot.id) throw new Error('元のRoom Theme IDとスナップショットが一致しません。');
  return { sourceThemeId: themeSnapshot.id, themeSnapshot };
}
export const createRoomThemeAssignment = (theme: RoomTheme): RoomThemeAssignment => ({ sourceThemeId: theme.id, themeSnapshot: normalizeRoomTheme(theme) });
