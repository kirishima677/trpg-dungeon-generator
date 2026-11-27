import { v4 as uuid } from 'uuid';
import { normalizeRoomTags } from './roomInformation';

export const CONTENT_KINDS = ['monster', 'treasure', 'trap', 'object', 'npc', 'event'] as const;
export type ContentKind = typeof CONTENT_KINDS[number];
export const CONTENT_LABELS: Record<ContentKind, string> = {
  monster: 'Monster', treasure: 'Treasure', trap: 'Trap', object: 'Object', npc: 'NPC', event: 'Event',
};
export type ContentAttributeValue = string | number | boolean;
export interface ContentDefinition {
  id: string; kind: ContentKind; name: string; summary: string;
  description: string; gmNotes: string; tags: string[];
  attributes: Record<string, ContentAttributeValue>;
  createdAt: string; updatedAt: string;
}
export type ContentDraft = Omit<ContentDefinition, 'createdAt' | 'updatedAt'>;
export const CONTENT_LIMITS = {
  id: 128, name: 200, summary: 1000, markdown: 100_000,
  tags: 50, tag: 64, attributes: 100, attributeKey: 100, attributeValue: 4000,
  importBytes: 10 * 1024 * 1024, batch: 1000,
} as const;
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && !Object.getOwnPropertySymbols(value).length;
}
function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${field}は${required ? '空ではない' : ''}文字列（${max}文字以内）で指定してください。`);
  }
  return value;
}
export function contentAttributes(entries: readonly (readonly [string, unknown])[]): Record<string, ContentAttributeValue> {
  if (entries.length > CONTENT_LIMITS.attributes) throw new Error(`属性は${CONTENT_LIMITS.attributes}個までです。`);
  const values: Record<string, ContentAttributeValue> = {};
  const keys = new Set<string>();
  for (const [rawKey, value] of entries) {
    const key = text(rawKey, '属性キー', CONTENT_LIMITS.attributeKey, true).trim();
    if (dangerousKeys.has(key)) throw new Error(`属性キー「${key}」は使用できません。`);
    if (keys.has(key)) throw new Error(`属性キー「${key}」が重複しています。`);
    if (!(typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) {
      throw new Error(`属性「${key}」は文字列・有限数値・真偽値で指定してください。`);
    }
    if (typeof value === 'string') text(value, `属性「${key}」`, CONTENT_LIMITS.attributeValue);
    keys.add(key); values[key] = value;
  }
  return values;
}
/** Shared pure validation. No truncation; normalizes names, tag whitespace and attribute keys. */
export function normalizeContentDraft(value: unknown): ContentDraft {
  if (!record(value)) throw new Error('コンテンツの形式が不正です。');
  if (!CONTENT_KINDS.includes(value.kind as ContentKind)) throw new Error('コンテンツ種別が不正です。');
  if (!Array.isArray(value.tags) || value.tags.length > CONTENT_LIMITS.tags) throw new Error(`タグは${CONTENT_LIMITS.tags}個までの文字列配列で指定してください。`);
  const tags = value.tags.map(t => text(t, 'タグ', CONTENT_LIMITS.tag));
  if (!record(value.attributes)) throw new Error('属性はキーと値の組み合わせで指定してください。');
  return { id: text(value.id, 'Content ID', CONTENT_LIMITS.id, true), kind: value.kind as ContentKind,
    name: text(value.name, '名称', CONTENT_LIMITS.name, true).trim(), summary: text(value.summary, '概要', CONTENT_LIMITS.summary),
    description: text(value.description, '公開説明', CONTENT_LIMITS.markdown), gmNotes: text(value.gmNotes, 'GM専用情報', CONTENT_LIMITS.markdown),
    tags: normalizeRoomTags(tags), attributes: contentAttributes(Object.entries(value.attributes)) };
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('日時は有効なUTC ISO日時で指定してください。');
  return value;
}
export function normalizeContent(value: unknown): ContentDefinition {
  const draft = normalizeContentDraft(value), raw = value as Record<string, unknown>;
  const createdAt = timestamp(raw.createdAt), updatedAt = timestamp(raw.updatedAt);
  if (updatedAt < createdAt) throw new Error('更新日時は作成日時以降で指定してください。');
  return { ...draft, createdAt, updatedAt };
}
export function newContent(kind: ContentKind = 'monster'): ContentDraft {
  return { id: uuid(), kind, name: '', summary: '', description: '', gmNotes: '', tags: [], attributes: {} };
}
export function duplicateContent(value: ContentDraft): ContentDraft {
  const content = normalizeContentDraft(value);
  return { ...content, id: uuid(), name: `${content.name}（複製）`, tags: [...content.tags], attributes: { ...content.attributes } };
}
/** Import identity ignores timestamps, tag order and attribute insertion order. */
export function sameContent(a: ContentDefinition, b: ContentDefinition): boolean {
  const canonical = (value: ContentDefinition) => {
    const v = normalizeContentDraft(value);
    return JSON.stringify({ ...v, tags: [...v.tags].sort(), attributes: Object.entries(v.attributes).sort(([a], [b]) => a.localeCompare(b)) });
  };
  return canonical(a) === canonical(b);
}
