import { useEffect, useRef, useState } from 'react';
import { useDungeonStore } from '../../store';
import { themeRepository } from '../../repository/themeRepository';
import type { ThemeRepository } from '../../repository/themeRepository';
import { searchThemes } from '../../themes/themeSearch';
import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';
import { useThemeLibrary } from './useThemeLibrary';
import { useThemeMaterials } from './useThemeMaterials';
import type { ThemeMaterialRepositories } from './useThemeMaterials';
import { ThemeCandidatePreview } from './ThemeCandidatePreview';

export function DungeonThemePanel({ close, repository = themeRepository, materials }: {
  close: () => void; repository?: ThemeRepository; materials?: ThemeMaterialRepositories;
}) {
  const dungeon = useDungeonStore(s => s.dungeon), library = useThemeLibrary(repository), assets = useThemeMaterials(materials);
  const snapshot = dungeon.theme?.themeSnapshot, source = library.themes.find(t => t.id === dungeon.theme?.sourceThemeId);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  const active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const values = searchThemes(library.themes, query), actualPage = Math.min(page, Math.max(0, Math.ceil(values.length / 50) - 1));
  const apply = async (id: string) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    const dungeonId = dungeon.id, assignment = JSON.stringify(dungeon.theme);
    try {
      const theme = await repository.get(id);
      if (!active.current) return;
      const state = useDungeonStore.getState();
      if (state.dungeon.id !== dungeonId || JSON.stringify(state.dungeon.theme) !== assignment) throw new Error('ダンジョンまたは適用テーマが変わりました。もう一度操作してください。');
      if (!theme) throw new Error('元のテーマが見つかりません。適用済みの定義は保持されています。');
      const failure = state.assignTheme(theme);
      if (failure) throw new Error(failure);
      setRefreshing(false);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'テーマを取得できませんでした。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  return <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="ダンジョンのテーマ設定">
    <h2>ダンジョンのテーマ設定</h2><p>「{dungeon.name}」の制作方針。部屋・接続・Entity・Markdownはそのまま保持します。変更はUndoで戻せます。</p>
    {error && <p role="alert">{error}</p>}{library.error && <p role="alert">{library.error}</p>}
    <fieldset disabled={busy || refreshing}>
      <button onClick={close}>閉じる</button><button onClick={() => void library.reload()}>テーマ一覧を再取得</button>
      {snapshot ? <>
        <h3>適用中: {snapshot.name}</h3><p>{snapshot.genre} / {snapshot.category} / {snapshot.tags.join(', ')}</p><p>{snapshot.summary}</p>
        <p>元のTheme ID: {dungeon.theme!.sourceThemeId}<br />適用定義の更新日時: {snapshot.updatedAt}</p>
        {!source && library.ready && <p>元のテーマはライブラリにありません。保存済みの定義を引き続き利用できます。</p>}
        {source && source.updatedAt !== snapshot.updatedAt && <p>ライブラリに別の更新版があります。適用済みの定義は自動変更されません。</p>}
        <button disabled={!source || !library.ready || !!library.error} onClick={() => { setError(''); setRefreshing(true); }}>テーマの最新版を反映</button>
        <button onClick={() => setError(useDungeonStore.getState().assignTheme(null) ?? '')}>テーマ解除</button>
        <details><summary>適用時点のテーマ定義</summary><h4>テーマ詳細</h4><div className="theme-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(snapshot.description, true) }} />
          <h4>テーマGM情報</h4><div className="theme-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(snapshot.gmNotes, true) }} />
          <h4>選択方針</h4><pre className="theme-policy">{JSON.stringify({ pieceSelection: snapshot.pieceSelection, contentSelection: snapshot.contentSelection }, null, 2)}</pre></details>
        <details><summary>現在の素材候補を確認</summary><p>選択方針は適用時点で固定されます。候補は現在のライブラリによって変わります。</p>
          {assets.error && <p role="alert">{assets.error}</p>}<button onClick={() => void assets.reload()}>素材一覧を再取得</button>
          {assets.ready ? <ThemeCandidatePreview pieceSelection={snapshot.pieceSelection} contentSelection={snapshot.contentSelection} pieces={assets.pieces} contents={assets.contents} /> : <p>素材一覧を読み込んでいます…</p>}</details>
      </> : <p>テーマ未設定です。テーマなしでも編集・出版できます。</p>}
      <h3>{snapshot ? 'テーマを変更' : 'テーマを適用'}</h3>
      <label>テーマを検索<input aria-label="適用テーマ検索" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <p>{values.length}件</p><div className="theme-candidates">{values.slice(actualPage * 50, (actualPage + 1) * 50).map(t => <label key={t.id}>
        <input type="radio" name="assigned-theme" aria-label={`${t.name}（${t.id}）を適用選択`} checked={selected === t.id} onChange={() => setSelected(t.id)} />
        <strong>{t.name}</strong><p>{t.genre} / {t.category} / {t.tags.join(', ')}</p><p>{t.summary}</p><small>{t.id}</small></label>)}</div>
      <button disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>前の50件</button><button disabled={(actualPage + 1) * 50 >= values.length} onClick={() => setPage(actualPage + 1)}>次の50件</button>
      <button disabled={!selected || !library.themes.some(t => t.id === selected) || !library.ready || !!library.error} onClick={() => void apply(selected)}>選択したテーマを適用</button>
    </fieldset>
    {refreshing && dungeon.theme && <section role="alertdialog" aria-label="テーマ更新の確認"><h3>適用済みの定義を更新しますか？</h3><p>現在のライブラリからテーマの定義を読み直します。部屋・接続・Entity・Markdownは保持します。</p>
      <button disabled={busy} onClick={() => void apply(dungeon.theme!.sourceThemeId)}>テーマ更新を確定</button><button disabled={busy} onClick={() => setRefreshing(false)}>キャンセル</button></section>}
  </section></div>;
}
