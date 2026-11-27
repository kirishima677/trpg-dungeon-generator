import { contentAttributes, normalizeContentDraft } from '../model/content';
import type { ContentDraft } from '../model/content';

export type AttributeType = 'string' | 'number' | 'boolean';
export interface AttributeRow { key: string; type: AttributeType; value: string }
export interface ContentForm { content: ContentDraft; tagsText: string; rows: AttributeRow[] }
function formatTags(tags: string[]): string {
  return tags.map(tag => /[,、\r\n"]/.test(tag) ? `"${tag.replaceAll('"', '""')}"` : tag).join(', ');
}
/** Quoted tags keep commas/newlines from imported libraries intact during editing. */
function parseTags(text: string): string[] {
  const tags: string[] = []; let value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += char;
    } else if (/[,、\r\n]/.test(char)) { tags.push(value); value = ''; closed = false; }
    else if (closed) { if (char.trim()) throw new Error('タグの引用符の後はカンマで区切ってください。'); }
    else if (char === '"' && !value.trim()) { value = ''; quoted = true; }
    else value += char;
  }
  if (quoted) throw new Error('タグの引用符を閉じてください。');
  tags.push(value); return tags;
}
export function toContentForm(content: ContentDraft): ContentForm {
  return { content: structuredClone(content), tagsText: formatTags(content.tags),
    rows: Object.entries(content.attributes).map(([key, value]) => ({ key, type: typeof value as AttributeType, value: String(value) })) };
}
export function fromContentForm(form: ContentForm): ContentDraft {
  const entries = form.rows.map(row => {
    let value: string | number | boolean = row.value;
    if (row.type === 'number') {
      if (!row.value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(row.value.trim()) || !Number.isFinite(Number(row.value))) {
        throw new Error(`属性「${row.key}」の値を有限数値へ修正してください。`);
      }
      value = Number(row.value);
    } else if (row.type === 'boolean') {
      if (row.value !== 'true' && row.value !== 'false') throw new Error(`属性「${row.key}」の値をtrueまたはfalseへ修正してください。`);
      value = row.value === 'true';
    } else if (row.type !== 'string') throw new Error('属性の型が不正です。');
    return [row.key, value] as const;
  });
  return normalizeContentDraft({ ...form.content, tags: parseTags(form.tagsText), attributes: contentAttributes(entries) });
}
