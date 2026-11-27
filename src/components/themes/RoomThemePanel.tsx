import { useEffect,useMemo,useRef,useState } from 'react';
import { useDungeonStore } from '../../store';
import { roomThemeRepository } from '../../repository/roomThemeRepository';
import type { RoomThemeRepository } from '../../repository/roomThemeRepository';
import type { RoomTheme } from '../../model/roomTheme';
import { useRoomThemeLibrary } from './useRoomThemeLibrary';
import { useThemeMaterials,themeMaterialRepositories } from './useThemeMaterials';
import type { ThemeMaterialRepositories } from './useThemeMaterials';
import { searchThemes } from '../../themes/themeSearch';
import { resolveRoomThemeSelection } from '../../model/themeSelection';
import { prepareRequiredPlacement,requiredPlacementRevision } from '../../model/roomThemePlacement';
import { diagnosePlacedRoom } from '../../model/roomThemeResolver';
import { RoomThemePreview } from './RoomThemePreview';
import { DEFAULT_PIECES } from '../../model/pieceLibrary';
import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';
import { CONTENT_LABELS } from '../../model/content';

function SnapshotDetails({theme}:{theme:RoomTheme}) {
  const description=useMemo(()=>renderMarkdownToHtml(theme.description,true),[theme.description]),notes=useMemo(()=>renderMarkdownToHtml(theme.gmNotes,true),[theme.gmNotes]);
  return <details><summary>適用時点のRoom Theme定義</summary><p>{theme.genre} / {theme.category} / {theme.purpose}</p><p>{theme.summary}</p><p>{theme.tags.join(', ')}</p>
    <p>Theme ID: {theme.id}<br />更新日時: {theme.updatedAt}</p><h4>構成知識</h4><div className="theme-markdown" dangerouslySetInnerHTML={{__html:description}} /><h4>テーマGM情報</h4><div className="theme-markdown" dangerouslySetInnerHTML={{__html:notes}} />
    <pre className="theme-policy">{JSON.stringify({pieceConstraints:theme.pieceConstraints,pieceSelection:theme.pieceSelection,contentSelection:theme.contentSelection,requiredContents:theme.requiredContents},null,2)}</pre>
  </details>;
}
export function RoomThemePanel({roomId,repository=roomThemeRepository,materials=themeMaterialRepositories}:{roomId:string;repository?:RoomThemeRepository;materials?:ThemeMaterialRepositories}) {
  const dungeon=useDungeonStore(s=>s.dungeon),room=dungeon.rooms.find(r=>r.id===roomId),theme=room?.roomTheme?.themeSnapshot;
  const library=useRoomThemeLibrary(repository),assets=useThemeMaterials(materials),active=useRef(true),running=useRef(false);
  const [modal,setModal]=useState<'choose'|'refresh'|'preview'|'place'|null>(null),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[page,setPage]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[ack,setAck]=useState(false);
  const [review,setReview]=useState<{plan:ReturnType<typeof prepareRequiredPlacement>;revision:string}|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const latest=library.themes.find(t=>t.id===room?.roomTheme?.sourceThemeId),filtered=searchThemes(library.themes,query),actualPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/50)-1));
  const allowed=useMemo(()=>new Set((dungeon.theme?resolveRoomThemeSelection(dungeon.theme.themeSnapshot.roomThemeSelection,library.themes).candidates:library.themes).map(t=>t.id)),[dungeon.theme,library.themes]);
  const diagnostics=useMemo(()=>room?diagnosePlacedRoom(room,dungeon.theme?.themeSnapshot):[],[room,dungeon.theme]);
  const execute=async(operation:()=>Promise<void>)=>{
    if(running.current)return;running.current=true;setBusy(true);setError('');
    try{await operation();}catch(e){if(active.current)setError(e instanceof Error?e.message:'Room Theme操作に失敗しました。');}
    finally{running.current=false;if(active.current)setBusy(false);}
  };
  const assertTarget=()=>{
    const state=useDungeonStore.getState();
    if(state.dungeon.id!==dungeon.id||state.selectedRoomId!==roomId||!state.dungeon.rooms.some(r=>r.id===roomId))throw new Error('選択中の部屋が変わりました。もう一度操作してください。');
    return state;
  };
  const apply=(id:string)=>void execute(async()=>{
    const assignment=JSON.stringify(room?.roomTheme),value=await repository.get(id);if(!active.current)return;
    const state=assertTarget();if(JSON.stringify(state.dungeon.rooms.find(r=>r.id===roomId)?.roomTheme)!==assignment)throw new Error('部屋の適用定義が変わりました。確認し直してください。');
    if(!value)throw new Error('元のRoom Themeが見つかりません。適用済みの定義は保持します。');
    const failure=state.assignRoomTheme(roomId,value);if(failure)throw new Error(failure);setModal(null);setNotice('Room Themeを適用しました。部屋情報と既存Entityは保持しています。');
  });
  const openPlacement=()=>{try{setReview({plan:prepareRequiredPlacement(dungeon,roomId,assets.contents,assets.pieces),revision:requiredPlacementRevision(dungeon,roomId,assets.contents,assets.pieces)});setAck(false);setError('');setModal('place');}catch(e){setError((e as Error).message);}};
  const place=()=>void execute(async()=>{
    const [contents,pieces]=await Promise.all([materials.contents.list(),materials.pieces.list()]);if(!active.current)return;
    const state=assertTarget(),allPieces=[...DEFAULT_PIECES,...pieces],revision=requiredPlacementRevision(state.dungeon,roomId,contents,allPieces);
    if(revision!==review?.revision){setReview({plan:prepareRequiredPlacement(state.dungeon,roomId,contents,allPieces),revision});setAck(false);throw new Error('素材または配置状態が変わりました。更新したプレビューを確認してから実行してください。');}
    const failure=state.placeRequiredContents(roomId,contents,allPieces,revision,ack);if(failure)throw new Error(failure);
    setModal(null);setNotice('未配置の必須項目を追加しました。配置済みEntityの手動編集は保持しています。');
  });
  if(!room)return null;
  return <section className="room-theme-panel" aria-label="部屋のRoom Theme"><h3>Room Theme</h3><p>部屋の用途・構成方針です。適用だけではPieceやEntityを変更しません。</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{library.error&&<p role="alert">{library.error}</p>}
    <fieldset disabled={busy||!!modal}><p>{theme?`適用中: ${theme.name}`:'Room Theme未設定'}</p>
      <button disabled={!library.ready||!!library.error} onClick={()=>{setError('');setModal('choose');}}>Room Themeを選択</button><button onClick={()=>void library.reload()}>Room Theme一覧を再取得</button>
      {theme&&<><SnapshotDetails theme={theme} />{!latest&&library.ready&&<p>元のRoom Themeはライブラリにありません。適用済みの定義は利用できます。</p>}{latest&&latest.updatedAt!==theme.updatedAt&&<p>ライブラリに更新版があります。自動変更はしません。</p>}
        <button disabled={!latest||!!library.error} onClick={()=>{setError('');setModal('refresh');}}>Room Themeの最新版を反映</button>
        <button onClick={()=>setError(useDungeonStore.getState().assignRoomTheme(roomId,null)??'')}>Room Theme解除</button>
        <button disabled={!assets.ready||!!assets.error} onClick={()=>setModal('preview')}>統合候補を確認</button>
        <button disabled={!assets.ready||!!assets.error} onClick={openPlacement}>必須Contentを配置</button>
        {!allowed.has(theme.id)&&<p>このRoom ThemeはDungeon Themeの候補に含まれません。手動適用は維持します。</p>}
        <ul>{diagnostics.map((w,i)=><li key={i}>{w.message}</li>)}</ul>
      </>}
      {assets.error&&<p role="alert">{assets.error}</p>}<button onClick={()=>void assets.reload()}>素材一覧を再取得</button>
    </fieldset>
    {modal&&<div className="theme-modal"><section role="dialog" aria-modal="true" aria-label={modal==='choose'?'部屋のRoom Theme選択':modal==='refresh'?'Room Theme更新の確認':modal==='place'?'必須Content配置プレビュー':'部屋の統合候補'}>
      {error&&<p role="alert">{error}</p>}
      {modal==='choose'&&<><h2>Room Themeを選択</h2><p>候補外のテーマも手動適用できます。</p><label>検索<input aria-label="適用Room Theme検索" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} /></label>
        <div className="theme-candidates">{filtered.slice(actualPage*50,(actualPage+1)*50).map(t=><label key={t.id}><input type="radio" name="room-theme" aria-label={`${t.name}（${t.id}）を部屋に適用選択`} checked={selected===t.id} onChange={()=>setSelected(t.id)} />{t.name} / {t.category} / {t.purpose} / {allowed.has(t.id)?'Dungeon候補':'Dungeon候補外'}<p>{t.summary}</p><small>{t.id}</small></label>)}</div>
        <button disabled={!actualPage} onClick={()=>setPage(actualPage-1)}>前の50件</button><button disabled={(actualPage+1)*50>=filtered.length} onClick={()=>setPage(actualPage+1)}>次の50件</button><button disabled={busy||!library.themes.some(t=>t.id===selected)} onClick={()=>apply(selected)}>部屋にテーマを適用</button></>}
      {modal==='refresh'&&theme&&<><h2>適用時点のRoom Theme定義を更新しますか？</h2><p>既存Piece・部屋情報・Entity・素材Snapshot・公開範囲を保持します。新しい必須項目の配置は別操作です。</p><button disabled={busy||!latest} onClick={()=>apply(theme.id)}>Room Theme更新を確定</button></>}
      {modal==='preview'&&theme&&<RoomThemePreview roomTheme={theme} dungeonTheme={dungeon.theme?.themeSnapshot} pieces={assets.pieces} contents={assets.contents} placedRoom={room} />}
      {modal==='place'&&review&&<><h2>必須Content配置プレビュー</h2><p>新規 {review.plan.added.length}件 / 配置済み {review.plan.entries.filter(e=>e.action==='skip').length}項目 / 解決不可 {review.plan.entries.filter(e=>e.status!=='resolved').length}項目</p>
        <p>配置済みEntityの数量・説明・公開範囲を上書きしません。同じContentの手動配置は配置済み判定に使いません。</p>
        <ul>{review.plan.entries.map(r=><li key={r.entry.id}>{r.content?.name??r.entry.contentId} / {CONTENT_LABELS[r.entry.expectedKind]} × {r.entry.quantity} / {r.status!=='resolved'?r.status:r.action==='skip'?'配置済みとしてスキップ':'新規追加'}{r.action==='skip'?`（現在数量${r.currentQuantity}、差${r.quantityDifference}）`:''}{r.conflict?' / 候補条件と競合':''}</li>)}</ul>
        {review.plan.blockers.map((m,i)=><p role="alert" key={i}>{m}</p>)}
        {!!review.plan.conflicts.length&&<><ul>{review.plan.conflicts.map((w,i)=><li key={i}>{w.message}</li>)}</ul><label><input aria-label="必須Contentの選択条件競合を確認" type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} />警告を確認して配置する</label></>}
        <button disabled={busy||!!review.plan.blockers.length||!review.plan.added.length||(!!review.plan.conflicts.length&&!ack)} onClick={place}>必須Contentの配置を確定</button></>}
      <button disabled={busy} onClick={()=>{setModal(null);setError('');}}>閉じる</button>
    </section></div>}
  </section>;
}
