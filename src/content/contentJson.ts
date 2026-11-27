import { CONTENT_LIMITS, normalizeContent } from '../model/content';
import type { ContentDefinition } from '../model/content';

export const CONTENT_SCHEMA_VERSION = '1.0.0';
export function checkedContentBatch(values: unknown): ContentDefinition[] {
  if (!Array.isArray(values) || values.length > CONTENT_LIMITS.batch) throw new Error(`コンテンツは一度に${CONTENT_LIMITS.batch}件までです。`);
  const contents = values.map(normalizeContent), ids = new Set<string>();
  for (const content of contents) {
    if (ids.has(content.id)) throw new Error('入力内でContent IDが重複しています。');
    ids.add(content.id);
  }
  return contents;
}
export function buildContentExport(contents: ContentDefinition[], single = false) {
  const values = checkedContentBatch(contents);
  if (single && values.length !== 1) throw new Error('単一出力には1件を選択してください。');
  const envelope = single ? { schemaVersion: CONTENT_SCHEMA_VERSION, type: 'content-definition', content: values[0] }
    : { schemaVersion: CONTENT_SCHEMA_VERSION, type: 'content-library', contents: values };
  if (new TextEncoder().encode(JSON.stringify(envelope, null, 2)).length > CONTENT_LIMITS.importBytes) throw new Error('出力が10 MiBを超えます。対象を分けてください。');
  return envelope;
}
/** JSON.parse silently keeps the last duplicate key. Reject duplicates, including escaped keys, before accepting data. */
export function rejectDuplicateJsonKeys(json: string) {
  const stack: { keys: Set<string> | null; key: boolean }[] = [];
  for (const [token] of json.matchAll(/"(?:\\.|[^"\\])*"|[{}[\],:]|[^{}[\],:\s]+/g)) {
    const top = stack.at(-1);
    if (token === '{' || token === '[') stack.push({ keys: token === '{' ? new Set() : null, key: token === '{' });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && top?.keys) top.key = true;
    else if (token === ':' && top) top.key = false;
    else if (token.startsWith('"') && top?.keys && top.key) {
      const key = JSON.parse(token) as string;
      if (top.keys.has(key)) throw new Error(`JSONのキー「${key}」が重複しています。`);
      top.keys.add(key);
    }
  }
}
export function parseContentJson(json: string): ContentDefinition[] {
  if (new TextEncoder().encode(json).length > CONTENT_LIMITS.importBytes) throw new Error('Importファイルは10 MiBまでです。');
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('JSON構文が不正です。'); }
  rejectDuplicateJsonKeys(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('コンテンツJSONの形式が不正です。');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== CONTENT_SCHEMA_VERSION) throw new Error('未対応のコンテンツスキーマバージョンです。');
  if (raw.type === 'content-definition') return checkedContentBatch([raw.content]);
  if (raw.type === 'content-library') return checkedContentBatch(raw.contents);
  throw new Error('コンテンツJSONのデータ種別が不正です。');
}
export function contentFilename(name: string): string {
  const safe = Array.from(name, c => c.charCodeAt(0) < 32 ? '_' : c).join('');
  const base = safe.replace(/[\\/:*?"<>|]/g, '_').trim().replace(/\.+$/g, '').slice(0, 100) || 'content';
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? '_' : ''}${base}.content.json`;
}
