import { CONTENT_KINDS } from '../model/content';
import type { ContentKind } from '../model/content';
import type { DungeonThemeDraft } from '../model/dungeonTheme';
import { normalizeThemeDraft } from '../model/dungeonTheme';
import type { SelectionMode, PieceSelectionPolicy, ContentKindSelection, ContentSelectionPolicy, RoomThemeSelectionPolicy } from '../model/themeSelection';
import { normalizePieceSelection, normalizeContentSelection, normalizeRoomThemeSelection } from '../model/themeSelection';
import { formatStringList, parseStringList } from '../utils/stringList';

export interface PolicyForm { mode: SelectionMode; include: string; exclude: string; allOf: string; anyOf: string; noneOf: string }
export interface ThemePolicyForm<T> { theme: T; tagsText: string; piece: PolicyForm; content: Record<ContentKind, PolicyForm> }
export interface ThemeForm extends ThemePolicyForm<DungeonThemeDraft> { roomThemes: PolicyForm }
export function toPolicyForm(policy: PieceSelectionPolicy | ContentKindSelection | RoomThemeSelectionPolicy): PolicyForm {
  return { mode: policy.mode, include: formatStringList('includePieceIds' in policy ? policy.includePieceIds : 'includeContentIds' in policy ? policy.includeContentIds : policy.includeRoomThemeIds),
    exclude: formatStringList('excludePieceIds' in policy ? policy.excludePieceIds : 'excludeContentIds' in policy ? policy.excludeContentIds : policy.excludeRoomThemeIds),
    allOf: formatStringList(policy.tags.allOf), anyOf: formatStringList(policy.tags.anyOf), noneOf: formatStringList(policy.tags.noneOf) };
}
export const policyList = (text: string, ids = false) => text.trim() ? parseStringList(text, ids ? 'ID' : 'タグ') : [];
function policy(form: PolicyForm) {
  return { mode: form.mode, tags: { allOf: policyList(form.allOf), anyOf: policyList(form.anyOf), noneOf: policyList(form.noneOf) } };
}
export function fromPolicyForms(form: Pick<ThemeForm, 'piece' | 'content'>): { pieceSelection: PieceSelectionPolicy; contentSelection: ContentSelectionPolicy } {
  return { pieceSelection: normalizePieceSelection({ ...policy(form.piece), includePieceIds: policyList(form.piece.include, true), excludePieceIds: policyList(form.piece.exclude, true) }),
    contentSelection: normalizeContentSelection(Object.fromEntries(CONTENT_KINDS.map(kind => [kind, { ...policy(form.content[kind]),
      includeContentIds: policyList(form.content[kind].include, true), excludeContentIds: policyList(form.content[kind].exclude, true) }]))) };
}
export function fromRoomThemePolicyForm(form: PolicyForm): RoomThemeSelectionPolicy {
  return normalizeRoomThemeSelection({ ...policy(form), includeRoomThemeIds:policyList(form.include,true),excludeRoomThemeIds:policyList(form.exclude,true) });
}
export function toThemePolicyForm<T extends Pick<DungeonThemeDraft,'tags' | 'pieceSelection' | 'contentSelection'>>(value: T): ThemePolicyForm<T> {
  return { theme: structuredClone(value), tagsText: formatStringList(value.tags), piece: toPolicyForm(value.pieceSelection),
    content: Object.fromEntries(CONTENT_KINDS.map(kind => [kind, toPolicyForm(value.contentSelection[kind])])) as Record<ContentKind, PolicyForm> };
}
export function toThemeForm(value: DungeonThemeDraft): ThemeForm { return { ...toThemePolicyForm(value), roomThemes:toPolicyForm(value.roomThemeSelection) }; }
export function fromThemeForm(form: ThemeForm): DungeonThemeDraft {
  return normalizeThemeDraft({ ...form.theme, tags: policyList(form.tagsText), ...fromPolicyForms(form),roomThemeSelection:fromRoomThemePolicyForm(form.roomThemes) });
}
