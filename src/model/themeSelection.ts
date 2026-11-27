import type { Piece } from './types';
import { CONTENT_KINDS } from './content';
import type { ContentDefinition, ContentKind } from './content';
import { normalizeRoomTags } from './roomInformation';

export const SELECTION_MODES = ['all', 'filtered', 'explicit', 'none'] as const;
export type SelectionMode = typeof SELECTION_MODES[number];
export interface TagSelectionCriteria { allOf: string[]; anyOf: string[]; noneOf: string[] }
export interface PieceSelectionPolicy { mode: SelectionMode; includePieceIds: string[]; excludePieceIds: string[]; tags: TagSelectionCriteria }
export interface RoomThemeSelectionPolicy { mode: SelectionMode; includeRoomThemeIds: string[]; excludeRoomThemeIds: string[]; tags: TagSelectionCriteria }
export interface ContentKindSelection { mode: SelectionMode; includeContentIds: string[]; excludeContentIds: string[]; tags: TagSelectionCriteria }
export type ContentSelectionPolicy = Record<ContentKind, ContentKindSelection>;
export const SELECTION_LIMITS = { ids: 100, idLength: 128, tags: 50, tagLength: 64 } as const;
export function selectionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('選択方針の形式が不正です。');
  return value as Record<string, unknown>;
}
export function selectionList(value: unknown, label: string, ids = false): string[] {
  const count = ids ? SELECTION_LIMITS.ids : SELECTION_LIMITS.tags, length = ids ? SELECTION_LIMITS.idLength : SELECTION_LIMITS.tagLength;
  if (!Array.isArray(value) || value.length > count || value.some(v => typeof v !== 'string' || v.length > length || (ids && !v.trim()))) throw new Error(`${label}は${count}件・各${length}文字以内の${ids ? '空ではない' : ''}文字列で指定してください。`);
  // IDs are opaque identifiers. Tags follow existing case-sensitive whitespace normalization.
  return ids ? [...new Set(value)] : normalizeRoomTags(value);
}
function common(value: unknown) {
  const raw = selectionRecord(value), tags = selectionRecord(raw.tags);
  if (!SELECTION_MODES.includes(raw.mode as SelectionMode)) throw new Error('素材の選択モードが不正です。');
  return { raw, mode: raw.mode as SelectionMode, tags: { allOf: selectionList(tags.allOf, '必須タグ'), anyOf: selectionList(tags.anyOf, 'いずれかのタグ'), noneOf: selectionList(tags.noneOf, '除外タグ') } };
}
export function normalizePieceSelection(value: unknown): PieceSelectionPolicy {
  const { raw, mode, tags } = common(value);
  return { mode, includePieceIds: selectionList(raw.includePieceIds, '明示Piece ID', true), excludePieceIds: selectionList(raw.excludePieceIds, '除外Piece ID', true), tags };
}
export function normalizeRoomThemeSelection(value: unknown): RoomThemeSelectionPolicy {
  const { raw, mode, tags } = common(value);
  return { mode, includeRoomThemeIds: selectionList(raw.includeRoomThemeIds, '明示Room Theme ID', true), excludeRoomThemeIds: selectionList(raw.excludeRoomThemeIds, '除外Room Theme ID', true), tags };
}
export function emptyRoomThemeSelection(mode: SelectionMode = 'none'): RoomThemeSelectionPolicy {
  return { mode, includeRoomThemeIds: [], excludeRoomThemeIds: [], tags: { allOf: [], anyOf: [], noneOf: [] } };
}
export function normalizeKindSelection(value: unknown): ContentKindSelection {
  const { raw, mode, tags } = common(value);
  return { mode, includeContentIds: selectionList(raw.includeContentIds, '明示Content ID', true), excludeContentIds: selectionList(raw.excludeContentIds, '除外Content ID', true), tags };
}
export function normalizeContentSelection(value: unknown): ContentSelectionPolicy {
  const raw = selectionRecord(value);
  if (Object.keys(raw).length !== CONTENT_KINDS.length || Object.keys(raw).some(k => !CONTENT_KINDS.includes(k as ContentKind))) throw new Error('Content選択方針には6種別を指定してください。');
  return Object.fromEntries(CONTENT_KINDS.map(kind => [kind, normalizeKindSelection(raw[kind])])) as ContentSelectionPolicy;
}
export function emptyPieceSelection(): PieceSelectionPolicy { return { mode: 'none', includePieceIds: [], excludePieceIds: [], tags: { allOf: [], anyOf: [], noneOf: [] } }; }
export function emptyContentSelection(): ContentSelectionPolicy {
  const result = {} as ContentSelectionPolicy;
  for (const kind of CONTENT_KINDS) result[kind] = { mode: 'none', includeContentIds: [], excludeContentIds: [], tags: { allOf: [], anyOf: [], noneOf: [] } };
  return result;
}
export interface SelectionWarning { code: 'missing-id' | 'kind-mismatch' | 'include-exclude-conflict' | 'tag-conflict' | 'excluded-id' | 'excluded-tag' | 'empty-candidates'; message: string; id?: string; kind?: ContentKind }
export interface SelectionResult<T> { candidates: T[]; warnings: SelectionWarning[] }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function resolve<T extends { id: string; tags?: string[]; kind?: ContentKind }>(mode: SelectionMode, include: string[], exclude: string[], criteria: TagSelectionCriteria, library: readonly T[], kind?: ContentKind): SelectionResult<T> {
  if (mode === 'none') return { candidates: [], warnings: [] };
  const warnings: SelectionWarning[] = [], byId = new Map<string, T>();
  for (const value of library) if (!byId.has(value.id)) byId.set(value.id, value);
  const warn = (code: SelectionWarning['code'], message: string, id?: string) => warnings.push({ code, message, ...(id ? { id } : {}), ...(kind ? { kind } : {}) });
  const activeIncludes = mode === 'filtered' || mode === 'explicit' ? include : [];
  for (const id of [...new Set([...activeIncludes, ...exclude])].sort(compare)) {
    const value = byId.get(id);
    if (!value) warn('missing-id', `素材ID「${id}」が見つかりません。`, id);
    else if (kind && value.kind !== kind) warn('kind-mismatch', `素材ID「${id}」の種別が${kind}と一致しません。`, id);
    if (activeIncludes.includes(id) && exclude.includes(id)) warn('include-exclude-conflict', `素材ID「${id}」は明示指定と除外指定が重複しています。`, id);
  }
  if (mode === 'filtered') {
    for (const tag of criteria.allOf.filter(t => criteria.noneOf.includes(t)).sort(compare)) warn('tag-conflict', `必須タグ「${tag}」が除外タグにも指定されています。`);
    if (criteria.anyOf.length && criteria.anyOf.every(t => criteria.noneOf.includes(t))) warn('tag-conflict', 'いずれかのタグがすべて除外タグにも指定されています。');
  }
  const positive = criteria.allOf.length > 0 || criteria.anyOf.length > 0;
  const candidates = [...byId.values()].filter(value => {
    if (kind && value.kind !== kind) return false;
    const tags = new Set(normalizeRoomTags(value.tags ?? []));
    const tagged = positive && criteria.allOf.every(t => tags.has(t)) && (!criteria.anyOf.length || criteria.anyOf.some(t => tags.has(t)));
    const selected = mode === 'all' || activeIncludes.includes(value.id) || (mode === 'filtered' && tagged);
    if (!selected) return false;
    if (exclude.includes(value.id)) { warn('excluded-id', `素材ID「${value.id}」を除外IDによって除外しました。`, value.id); return false; }
    if (criteria.noneOf.some(t => tags.has(t))) { warn('excluded-tag', `素材ID「${value.id}」を除外タグによって除外しました。`, value.id); return false; }
    return true;
  }).sort((a, b) => compare(a.id, b.id));
  if (!candidates.length) warn('empty-candidates', '使用する設定ですが候補がありません。');
  warnings.sort((a, b) => compare(`${a.code}:${a.id ?? ''}:${a.message}`, `${b.code}:${b.id ?? ''}:${b.message}`));
  return { candidates, warnings };
}
export function resolvePieceSelection(value: PieceSelectionPolicy, pieces: readonly Piece[]): SelectionResult<Piece> {
  const p = normalizePieceSelection(value); return resolve(p.mode, p.includePieceIds, p.excludePieceIds, p.tags, pieces);
}
export function resolveRoomThemeSelection<T extends { id: string; tags: string[] }>(value: RoomThemeSelectionPolicy, themes: readonly T[]): SelectionResult<T> {
  const p = normalizeRoomThemeSelection(value); return resolve(p.mode, p.includeRoomThemeIds, p.excludeRoomThemeIds, p.tags, themes);
}
export function resolveContentSelection(value: ContentSelectionPolicy, contents: readonly ContentDefinition[]) {
  const policies = normalizeContentSelection(value), warnings: SelectionWarning[] = [];
  const candidates = Object.fromEntries(CONTENT_KINDS.map(kind => {
    const p = policies[kind], result = resolve(p.mode, p.includeContentIds, p.excludeContentIds, p.tags, contents, kind);
    warnings.push(...result.warnings); return [kind, result.candidates];
  })) as Record<ContentKind, ContentDefinition[]>;
  return { candidates, warnings };
}
