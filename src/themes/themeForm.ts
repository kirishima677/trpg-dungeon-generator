import { CONTENT_KINDS } from '../model/content';
import type { ContentKind } from '../model/content';
import type { DungeonThemeDraft } from '../model/dungeonTheme';
import { normalizeThemeDraft } from '../model/dungeonTheme';
import type { SelectionMode, PieceSelectionPolicy, ContentKindSelection, ContentSelectionPolicy } from '../model/themeSelection';
import { normalizePieceSelection, normalizeContentSelection } from '../model/themeSelection';
import { formatStringList, parseStringList } from '../utils/stringList';

export interface PolicyForm { mode: SelectionMode; include: string; exclude: string; allOf: string; anyOf: string; noneOf: string }
export interface ThemeForm { theme: DungeonThemeDraft; tagsText: string; piece: PolicyForm; content: Record<ContentKind, PolicyForm> }
export function toPolicyForm(policy: PieceSelectionPolicy | ContentKindSelection): PolicyForm {
  return { mode: policy.mode, include: formatStringList('includePieceIds' in policy ? policy.includePieceIds : policy.includeContentIds),
    exclude: formatStringList('excludePieceIds' in policy ? policy.excludePieceIds : policy.excludeContentIds),
    allOf: formatStringList(policy.tags.allOf), anyOf: formatStringList(policy.tags.anyOf), noneOf: formatStringList(policy.tags.noneOf) };
}
const list = (text: string, ids = false) => text.trim() ? parseStringList(text, ids ? 'ID' : 'タグ') : [];
function policy(form: PolicyForm) {
  return { mode: form.mode, tags: { allOf: list(form.allOf), anyOf: list(form.anyOf), noneOf: list(form.noneOf) } };
}
export function fromPolicyForms(form: Pick<ThemeForm, 'piece' | 'content'>): { pieceSelection: PieceSelectionPolicy; contentSelection: ContentSelectionPolicy } {
  return { pieceSelection: normalizePieceSelection({ ...policy(form.piece), includePieceIds: list(form.piece.include, true), excludePieceIds: list(form.piece.exclude, true) }),
    contentSelection: normalizeContentSelection(Object.fromEntries(CONTENT_KINDS.map(kind => [kind, { ...policy(form.content[kind]),
      includeContentIds: list(form.content[kind].include, true), excludeContentIds: list(form.content[kind].exclude, true) }]))) };
}
export function toThemeForm(value: DungeonThemeDraft): ThemeForm {
  return { theme: structuredClone(value), tagsText: formatStringList(value.tags), piece: toPolicyForm(value.pieceSelection),
    content: Object.fromEntries(CONTENT_KINDS.map(kind => [kind, toPolicyForm(value.contentSelection[kind])])) as Record<ContentKind, PolicyForm> };
}
export function fromThemeForm(form: ThemeForm): DungeonThemeDraft {
  return normalizeThemeDraft({ ...form.theme, tags: list(form.tagsText), ...fromPolicyForms(form) });
}
