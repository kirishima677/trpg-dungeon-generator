import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTENT_KINDS, CONTENT_LABELS, CONTENT_LIMITS } from '../../model/content';
import type { ContentKind } from '../../model/content';
import { fromContentForm } from '../../content/contentForm';
import { searchContents } from '../../content/contentSearch';
import { buildContentExport, contentFilename } from '../../content/contentJson';
import type { ContentRepository, ContentCollisionPolicy } from '../../repository/contentRepository';
import { downloadJson } from '../../utils/exportImport';
import { useContentEditor } from './useContentEditor';
import { ContentAttributes, ContentMarkdown } from './ContentFields';

const PAGE_SIZE = 50;
export function ContentEditor({ repository, download = downloadJson }: { repository?: ContentRepository; download?: typeof downloadJson }) {
  const editor = useContentEditor(repository), { form, baseline } = editor.entry;
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [kind, setKind] = useState<ContentKind | ''>('');
  const [page, setPage] = useState(0), [selected, setSelected] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState('current'), [policy, setPolicy] = useState<ContentCollisionPolicy>('skip');
  const filtered = useMemo(() => searchContents(editor.items, query, kind), [editor.items, query, kind]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1), shownPage = Math.min(page, lastPage);
  useEffect(() => setPage(0), [query, kind]);
  const validError = useMemo(() => { try { fromContentForm(form); return ''; } catch (e) { return (e as Error).message; } }, [form]);
  const exportContents = () => editor.execute(() => {
    const contents = scope === 'current' ? editor.items.filter(c => c.id === form.content.id)
      : scope === 'selected' ? editor.items.filter(c => selected.has(c.id)) : scope === 'filtered' ? filtered : editor.items;
    if (!contents.length) throw new Error('出力対象の保存済みコンテンツがありません。');
    const data = buildContentExport(contents, scope === 'current');
    download(data, contentFilename(scope === 'current' ? contents[0].name : 'content-library'));
  });
  return <main className="content-editor">
    <header><h1>コンテンツライブラリ</h1><p>GM向けの制作データです。JSONにはGM専用情報も含まれます。</p>
      <p role="status">{editor.busy ? '処理中…' : editor.dirty ? '未保存の変更があります' : baseline ? '保存済み' : '新規（未登録）'}</p></header>
    {editor.error && <p role="alert" className="content-error">{editor.error}</p>}
    {editor.notice && <p role="status">{editor.notice}</p>}
    <fieldset disabled={editor.busy || !!editor.pending || !!editor.incoming || editor.deleting} className="content-toolbar">
      <button onClick={() => editor.create(form.content.kind)}>新規</button>
      <button disabled={!editor.ready || !!validError} onClick={() => void editor.save()}>保存</button>
      <button disabled={!baseline || !!validError} onClick={editor.duplicate}>複製</button>
      <button disabled={!baseline} onClick={() => editor.setDeleting(true)}>削除</button>
      <button onClick={() => editor.request(() => { fileRef.current?.click(); })}>Import JSON</button>
      <label>出力対象<select aria-label="コンテンツの出力対象" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="current">編集中の保存済みコンテンツ</option><option value="selected">複数選択</option>
        <option value="filtered">検索・絞り込み結果</option><option value="all">ライブラリ全体</option></select></label>
      <button disabled={!editor.ready} onClick={() => void exportContents()}>Export JSON</button>
      <button onClick={() => void editor.retry()}>一覧を再取得</button>
    </fieldset>
    <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="コンテンツJSONファイル"
      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void editor.readImport(file); }} />
    <fieldset className="content-layout" disabled={editor.busy || !!editor.pending || !!editor.incoming || editor.deleting}>
      <aside aria-label="コンテンツ一覧">
        <label>検索<input aria-label="コンテンツ検索" placeholder="名称・概要・タグ" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label>種別フィルター<select aria-label="コンテンツ種別フィルター" value={kind} onChange={e => setKind(e.target.value as ContentKind | '')}>
          <option value="">すべて</option>{CONTENT_KINDS.map(k => <option key={k} value={k}>{CONTENT_LABELS[k]}</option>)}</select></label>
        <p>{filtered.length}件 / 全{editor.items.length}件（選択{editor.items.filter(c => selected.has(c.id)).length}件）</p>
        {filtered.length === 0 && <p>{editor.ready ? '該当するコンテンツはありません。' : '一覧を読み込んでいます…'}</p>}
        {filtered.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map(c => <article key={c.id}>
          <label><input type="checkbox" aria-label={`${c.name}（${c.id}）を出力選択`} checked={selected.has(c.id)}
            onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} /> 出力選択</label>
          <button className="content-item" aria-pressed={form.content.id === c.id} onClick={() => editor.select(c.id)}>
            <strong>{c.name}</strong><span>{CONTENT_LABELS[c.kind]}</span><p>{c.summary}</p><p>{c.tags.join(' / ')}</p><small>{c.id}</small>
          </button>
        </article>)}
        <nav aria-label="一覧ページ"><button disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>前の50件</button>
          <span>{shownPage + 1} / {lastPage + 1}</span><button disabled={shownPage >= lastPage} onClick={() => setPage(shownPage + 1)}>次の50件</button></nav>
      </aside>
      <section className="content-properties" aria-label="コンテンツの編集">
        <p className="content-id">Content ID: {form.content.id}</p>
        {baseline && <p>作成: {baseline.createdAt} / 更新: {baseline.updatedAt}</p>}
        <label>名称<input aria-label="コンテンツ名称" maxLength={CONTENT_LIMITS.name} value={form.content.name} onChange={e => editor.patchContent({ name: e.target.value })} /></label>
        <label>種別<select aria-label="コンテンツ種別" value={form.content.kind} onChange={e => editor.patchContent({ kind: e.target.value as ContentKind })}>
          {CONTENT_KINDS.map(k => <option key={k} value={k}>{CONTENT_LABELS[k]}</option>)}</select></label>
        <label>概要<textarea aria-label="コンテンツ概要" maxLength={CONTENT_LIMITS.summary} rows={2} value={form.content.summary} onChange={e => editor.patchContent({ summary: e.target.value })} /></label>
        <label>タグ（カンマ区切り）<input aria-label="コンテンツタグ" value={form.tagsText} onChange={e => editor.patch({ tagsText: e.target.value })} /></label>
        <ContentMarkdown description={form.content.description} gmNotes={form.content.gmNotes} onChange={(field, value) => editor.patchContent({ [field]: value })} />
        <ContentAttributes rows={form.rows} onChange={rows => editor.patch({ rows })} />
        {validError && <p className="content-error" role="status">{validError}</p>}
      </section>
    </fieldset>
    {editor.pending && <div className="content-modal"><section role="dialog" aria-modal="true" aria-label="未保存の変更">
      <h2>未保存の変更があります</h2><p>変更を保存してから続けるか、破棄するかを選んでください。</p>
      {(editor.error || validError) && <p role="alert" className="content-error">{editor.error || validError}</p>}
      <button disabled={editor.busy || !!validError} onClick={() => void editor.resolvePending('save')}>保存して続ける</button>
      <button disabled={editor.busy} onClick={() => void editor.resolvePending('discard')}>変更を破棄して続ける</button>
      <button disabled={editor.busy} onClick={() => void editor.resolvePending('cancel')}>キャンセル</button>
    </section></div>}
    {editor.deleting && <div className="content-modal"><section role="dialog" aria-modal="true" aria-label="コンテンツの削除確認">
      <h2>コンテンツを削除しますか？</h2><p>「{baseline?.name}」と編集中の変更は復元できません。</p>
      {editor.error && <p role="alert" className="content-error">{editor.error}</p>}
      <button disabled={editor.busy} onClick={() => void editor.deleteCurrent()}>削除を確定</button>
      <button disabled={editor.busy} onClick={() => editor.setDeleting(false)}>キャンセル</button>
    </section></div>}
    {editor.incoming && <div className="content-modal"><section role="dialog" aria-modal="true" aria-label="コンテンツImportの確認">
      <h2>コンテンツをImport</h2><p>{editor.incoming.length}件を検証しました。同一ID・同一内容は再利用します（日時だけの違いも再利用）。</p>
      {editor.error && <p role="alert" className="content-error">{editor.error}</p>}
      <p>異なる内容でIDが衝突する場合: {editor.incoming.filter(c => editor.items.some(existing => existing.id === c.id)).length}件の既存IDを含みます。保存時に再確認します。</p>
      <label>ID衝突時の処理<select aria-label="ID衝突時の処理" value={policy} onChange={e => setPolicy(e.target.value as ContentCollisionPolicy)}>
        <option value="skip">既存データを保持してスキップ</option><option value="new-id">新規IDで別コンテンツとして登録</option></select></label>
      <button disabled={editor.busy} onClick={() => void editor.importContents(policy)}>Importを実行</button>
      <button disabled={editor.busy} onClick={() => editor.setIncoming(null)}>キャンセル</button>
    </section></div>}
  </main>;
}
