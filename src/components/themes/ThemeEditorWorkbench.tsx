import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LibraryEditorState } from '../library/useLibraryEditor';
import type { ThemePolicyForm } from '../../themes/themeForm';
import type { useThemeMaterials } from './useThemeMaterials';
import { CONTENT_KINDS, CONTENT_LABELS } from '../../model/content';
import type { ContentKind } from '../../model/content';
import { THEME_LIMITS } from '../../model/dungeonTheme';
import type { DungeonThemeDraft } from '../../model/dungeonTheme';
import { fromPolicyForms } from '../../themes/themeForm';
import type { PolicyForm } from '../../themes/themeForm';
import { searchThemes } from '../../themes/themeSearch';
import { parseStringList } from '../../utils/stringList';
import { downloadJson } from '../../utils/exportImport';
import { ContentMarkdown } from '../content/ContentFields';
import { PolicyEditor, ThemeMaterialPicker } from './PolicyEditor';
import { ThemeCandidatePreview } from './ThemeCandidatePreview';

type BaseDraft = Omit<DungeonThemeDraft, 'roomThemeSelection'>;
export function ThemeEditorWorkbench<D extends BaseDraft, T extends D & { createdAt: string; updatedAt: string }, F extends ThemePolicyForm<D>>({
  editor, library, title, validError, buildExport, filename, download = downloadJson, extraFields, extraTabs = [], preview, libraryName = 'dungeon-theme-library',
}: {
  editor: LibraryEditorState<D,T,F>; library: ReturnType<typeof useThemeMaterials>; title: string; validError: string;
  buildExport: (values:T[],single:boolean) => unknown; filename:(name:string) => string; download?:typeof downloadJson;
  extraFields?:ReactNode; extraTabs?:{id:string;title:string;content:ReactNode}[]; preview?:ReactNode;
  libraryName?:string;
}) {
  const { form, baseline } = editor.entry;
  const file = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [genre, setGenre] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(0);
  const [kind, setKind] = useState<ContentKind>('monster'), [tab, setTab] = useState('basic');
  const [scope, setScope] = useState('current'), [policy, setPolicy] = useState<'skip' | 'new-id'>('skip'), [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<{ kind: 'piece' | ContentKind; excluded: boolean; text: string } | null>(null);
  const policies = useMemo(() => { try { return { value: fromPolicyForms(form), error: '' }; } catch (e) { return { value: null, error: (e as Error).message }; } }, [form.piece, form.content]);
  const filtered = useMemo(() => searchThemes(editor.items, query, genre, category), [editor.items, query, genre, category]);
  const actualPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const patch = (patch: Partial<D>) => editor.changeForm(f => ({ ...f, theme: { ...f.theme, ...patch } }));
  const patchPolicy = (which: 'piece' | ContentKind, patch: Partial<PolicyForm>) => editor.changeForm(f => which === 'piece' ? { ...f, piece: { ...f.piece, ...patch } }
    : { ...f, content: { ...f.content, [which]: { ...f.content[which], ...patch } } });
  const openPicker = (which: 'piece' | ContentKind, excluded: boolean) => void editor.execute(() => {
    const p = which === 'piece' ? form.piece : form.content[which], text = excluded ? p.exclude : p.include;
    if (text.trim()) parseStringList(text, 'ID');
    setPicker({ kind: which, excluded, text });
  });
  const genres = [...new Set(editor.items.map(t => t.genre).filter(Boolean))].sort(), categories = [...new Set(editor.items.map(t => t.category).filter(Boolean))].sort();
  const blocked = editor.busy || !!editor.pending || !!editor.incoming || editor.deleting || !!picker;
  return <main className="content-editor theme-editor"><header><h1>{title}</h1><p>GM向けの制作方針です。適用しても部屋やEntityを自動生成・置換しません。</p>
    <p role="status">{editor.busy ? '処理中…' : editor.dirty ? '未保存の変更があります' : baseline ? '保存済み' : '新規（未登録）'}</p></header>
    {editor.error && <p role="alert">{editor.error}</p>}{editor.notice && <p role="status">{editor.notice}</p>}
    <fieldset disabled={blocked} className="content-toolbar">
      <button onClick={() => editor.create()}>新規</button><button disabled={!editor.ready || !!validError} onClick={() => void editor.save()}>保存</button>
      <button disabled={!baseline || !!validError} onClick={editor.duplicate}>複製</button><button disabled={!baseline} onClick={() => editor.setDeleting(true)}>削除</button>
      <button onClick={() => editor.request(() => { file.current?.click(); })}>Import JSON</button>
      <label>出力対象<select aria-label="テーマの出力対象" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="current">編集中の保存済みテーマ</option><option value="selected">複数選択</option><option value="filtered">検索・絞り込み結果</option><option value="all">ライブラリ全体</option></select></label>
      <button disabled={!editor.ready} onClick={() => void editor.execute(() => {
        const values = scope === 'current' ? editor.items.filter(t => t.id === form.theme.id) : scope === 'selected' ? editor.items.filter(t => selected.has(t.id)) : scope === 'filtered' ? filtered : editor.items;
        if (!values.length) throw new Error('出力対象の保存済みテーマがありません。');
        download(buildExport(values, scope === 'current'), filename(scope === 'current' ? values[0].name : libraryName));
      })}>Export JSON</button><button onClick={() => void editor.retry()}>一覧を再取得</button>
    </fieldset>
    <input ref={file} type="file" accept=".json,application/json" hidden aria-label="テーマJSONファイル" onChange={e => { const selected = e.target.files?.[0]; e.target.value = ''; if (selected) void editor.readImport(selected); }} />
    <fieldset disabled={blocked} className="content-layout"><aside aria-label="テーマ一覧">
      <label>検索<input aria-label="テーマ検索" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <label>ジャンル絞り込み<select aria-label="ジャンル絞り込み" value={genre} onChange={e => { setGenre(e.target.value); setPage(0); }}><option value="">すべて</option>{genres.map(g => <option key={g}>{g}</option>)}</select></label>
      <label>施設分類絞り込み<select aria-label="施設分類絞り込み" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">すべて</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <p>{filtered.length}件 / 全{editor.items.length}件</p>
      {filtered.slice(actualPage * 50, (actualPage + 1) * 50).map(t => <article key={t.id}><label><input type="checkbox" aria-label={`${t.name}（${t.id}）を出力選択`} checked={selected.has(t.id)} onChange={e => setSelected(previous => {
        const next = new Set(previous); if (e.target.checked) next.add(t.id); else next.delete(t.id); return next;
      })} />出力選択</label><button className="content-item" aria-pressed={form.theme.id === t.id} onClick={() => editor.select(t.id)}><strong>{t.name}</strong><p>{t.genre} / {t.category}</p>{'purpose' in t && <p>{String(t.purpose)}</p>}<p>{t.summary}</p><p>{t.tags.join(', ')}</p><small>{t.id}</small></button></article>)}
      <button disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>前の50件</button><button disabled={(actualPage + 1) * 50 >= filtered.length} onClick={() => setPage(actualPage + 1)}>次の50件</button>
    </aside><section className="content-properties" aria-label="テーマの編集">
      <p>Theme ID: {form.theme.id}</p>{baseline && <p>作成: {baseline.createdAt} / 更新: {baseline.updatedAt}</p>}
      <nav>{[['basic','基本情報'],['markdown','Markdown'],['piece','Piece候補'],['content','Content候補'],...extraTabs.map(t => [t.id,t.title]),['preview','候補プレビュー']].map(([id, title]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}</nav>
      <div hidden={tab !== 'basic'}>
        {([['name','テーマ名称',THEME_LIMITS.name],['genre','ジャンル',THEME_LIMITS.classification],['category','施設分類',THEME_LIMITS.classification],['summary','テーマ概要',THEME_LIMITS.summary]] as const).map(([field,label,max]) => <label key={field}>{label}<input aria-label={label} maxLength={max} value={form.theme[field]} onChange={e => patch({ [field]: e.target.value } as Partial<D>)} /></label>)}
        <label>テーマタグ（カンマ区切り）<input aria-label="テーマタグ" value={form.tagsText} onChange={e => editor.changeForm(f => ({ ...f, tagsText: e.target.value }))} /></label>
        {extraFields}
      </div>
      <div hidden={tab !== 'markdown'}><ContentMarkdown description={form.theme.description} gmNotes={form.theme.gmNotes} descriptionLabel="テーマ詳細" notesLabel="テーマGM情報" onChange={(field,value) => patch({ [field]: value } as Partial<D>)} /></div>
      <div hidden={tab !== 'piece'}><PolicyEditor label="Piece" policy={form.piece} onChange={p => patchPolicy('piece',p)} openPicker={excluded => openPicker('piece',excluded)} /></div>
      <div hidden={tab !== 'content'}><nav>{CONTENT_KINDS.map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{CONTENT_LABELS[k]}</button>)}</nav>
        <PolicyEditor label={CONTENT_LABELS[kind]} policy={form.content[kind]} onChange={p => patchPolicy(kind,p)} openPicker={excluded => openPicker(kind,excluded)} /></div>
      {extraTabs.map(t => <div key={t.id} hidden={tab !== t.id}>{t.content}</div>)}
      <div hidden={tab !== 'preview'}>{library.error && <p role="alert">{library.error}</p>}<button onClick={() => void library.reload()}>素材一覧を再取得</button>
        {preview ?? (!library.ready ? <p>素材一覧を読み込んでいます…</p> : policies.value ? <ThemeCandidatePreview {...policies.value} pieces={library.pieces} contents={library.contents} /> : <p role="alert">{policies.error}</p>)}</div>
      {validError && <p role="status">{validError}</p>}
    </section></fieldset>
    {picker && <ThemeMaterialPicker {...library} kind={picker.kind} initial={picker.text} close={() => setPicker(null)} apply={text => { patchPolicy(picker.kind, { [picker.excluded ? 'exclude' : 'include']: text }); setPicker(null); }} />}
    {editor.pending && <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="テーマの未保存変更"><h2>未保存の変更があります</h2>
      {(editor.error || validError) && <p role="alert">{editor.error || validError}</p>}
      <button disabled={editor.busy || !!validError} onClick={() => void editor.resolvePending('save')}>保存して続ける</button><button disabled={editor.busy} onClick={() => void editor.resolvePending('discard')}>変更を破棄して続ける</button><button disabled={editor.busy} onClick={() => void editor.resolvePending('cancel')}>キャンセル</button>
    </section></div>}
    {editor.deleting && <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="テーマの削除確認"><h2>テーマを削除しますか？</h2><p>「{baseline?.name}」は復元できません。適用済みのダンジョンは保持されます。</p>
      {editor.error && <p role="alert">{editor.error}</p>}<button disabled={editor.busy} onClick={() => void editor.deleteCurrent()}>削除を確定</button><button disabled={editor.busy} onClick={() => editor.setDeleting(false)}>キャンセル</button></section></div>}
    {editor.incoming && <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="テーマImportの確認"><h2>テーマをImport</h2><p>{editor.incoming.length}件を検証しました。素材が存在しない参照も保持します。</p>
      <label>ID衝突時の処理<select aria-label="テーマID衝突時の処理" value={policy} onChange={e => setPolicy(e.target.value as typeof policy)}><option value="skip">スキップ</option><option value="new-id">新規IDで別テーマとして登録</option></select></label>
      {editor.error && <p role="alert">{editor.error}</p>}<button disabled={editor.busy} onClick={() => void editor.importItems(policy)}>Importを実行</button><button disabled={editor.busy} onClick={() => editor.setIncoming(null)}>キャンセル</button></section></div>}
  </main>;
}
