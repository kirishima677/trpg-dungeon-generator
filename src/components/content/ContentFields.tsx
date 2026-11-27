import { useMemo, useState } from 'react';
import type { AttributeRow } from '../../content/contentForm';
import { CONTENT_LIMITS } from '../../model/content';
import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';

export function ContentMarkdown({ description, gmNotes, onChange }: {
  description: string; gmNotes: string; onChange: (field: 'description' | 'gmNotes', value: string) => void;
}) {
  const [field, setField] = useState<'description' | 'gmNotes'>('description');
  const value = field === 'description' ? description : gmNotes;
  const html = useMemo(() => renderMarkdownToHtml(value, true), [value]);
  const label = field === 'description' ? '公開説明' : 'GM専用情報';
  return <section aria-label="Markdownの編集">
    <nav aria-label="説明の種類"><button type="button" aria-pressed={field === 'description'} onClick={() => setField('description')}>公開説明</button>
      <button type="button" aria-pressed={field === 'gmNotes'} onClick={() => setField('gmNotes')}>GM専用情報</button></nav>
    <div className="content-markdown">
      <label>{label}（Markdown）<textarea aria-label={`${label}（Markdown）`} value={value} maxLength={CONTENT_LIMITS.markdown}
        onChange={e => onChange(field, e.target.value)} /></label>
      <section className="content-preview" aria-label={`${label}のプレビュー`} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </section>;
}

export function ContentAttributes({ rows, onChange }: { rows: AttributeRow[]; onChange: (rows: AttributeRow[]) => void }) {
  const change = (index: number, patch: Partial<AttributeRow>) => onChange(rows.map((r, i) => i === index ? { ...r, ...patch } : r));
  return <section aria-label="任意属性"><h2>任意属性</h2>
    <p>型を変更しても入力値は保持します。数値・真偽値に変換できない場合は修正してください。</p>
    {rows.map((row, index) => <div className="content-attribute" key={index}>
      <label>キー<input aria-label={`属性${index + 1}のキー`} value={row.key} maxLength={CONTENT_LIMITS.attributeKey} onChange={e => change(index, { key: e.target.value })} /></label>
      <label>型<select aria-label={`属性${index + 1}の型`} value={row.type} onChange={e => change(index, { type: e.target.value as AttributeRow['type'] })}>
        <option value="string">文字列</option><option value="number">数値</option><option value="boolean">真偽値</option></select></label>
      <label>値<input aria-label={`属性${index + 1}の値`} value={row.value} maxLength={CONTENT_LIMITS.attributeValue}
        placeholder={row.type === 'boolean' ? 'true または false' : ''} onChange={e => change(index, { value: e.target.value })} /></label>
      <button type="button" aria-label={`属性${index + 1}を削除`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>削除</button>
    </div>)}
    <button type="button" disabled={rows.length >= CONTENT_LIMITS.attributes} onClick={() => onChange([...rows, { key: '', type: 'string', value: '' }])}>属性追加</button>
  </section>;
}
