import { useMemo,useState } from 'react';
import type { DungeonTheme } from '../../model/dungeonTheme';
import type { RoomThemeDraft } from '../../model/roomTheme';
import type { Piece,PlacedRoom } from '../../model/types';
import type { ContentDefinition,ContentKind } from '../../model/content';
import { CONTENT_KINDS,CONTENT_LABELS } from '../../model/content';
import { resolveRoomTheme,diagnosePlacedRoom } from '../../model/roomThemeResolver';

export function RoomThemePreview({roomTheme,dungeonTheme,pieces,contents,placedRoom}:{roomTheme:RoomThemeDraft;dungeonTheme?:DungeonTheme;pieces:readonly Piece[];contents:readonly ContentDefinition[];placedRoom?:PlacedRoom}) {
  const solo=useMemo(()=>resolveRoomTheme({roomTheme,pieces,contents}),[roomTheme,pieces,contents]);
  const combined=useMemo(()=>dungeonTheme?resolveRoomTheme({roomTheme,dungeonTheme,pieces,contents}):solo,[solo,roomTheme,dungeonTheme,pieces,contents]);
  const [kind,setKind]=useState<'piece'|ContentKind>('piece'),[scope,setScope]=useState('combined'),[page,setPage]=useState(0);
  const result=scope==='solo'?solo:combined,values=kind==='piece'?result.pieceCandidates.map(v=>({...v.piece,rotations:v.rotations})):result.contentCandidates[kind];
  const warnings=useMemo(()=>[...combined.warnings,...(placedRoom?diagnosePlacedRoom(placedRoom,dungeonTheme):[])],[combined,placedRoom,dungeonTheme]);
  const actualPage=Math.min(page,Math.max(0,Math.ceil(values.length/50)-1));
  return <section aria-label="Room Theme候補プレビュー"><h2>Room Theme候補プレビュー</h2><p>方針の積集合に構造条件を適用します。素材の定義は現在のライブラリを使用します。</p>
    <table className="room-theme-counts"><thead><tr><th>素材</th><th>単体</th><th>統合</th></tr></thead><tbody>
      <tr><th>Piece</th><td>{solo.pieceCandidates.length}</td><td>{combined.pieceCandidates.length}</td></tr>{CONTENT_KINDS.map(k=><tr key={k}><th>{CONTENT_LABELS[k]}</th><td>{solo.contentCandidates[k].length}</td><td>{combined.contentCandidates[k].length}</td></tr>)}
    </tbody></table>
    <label>表示集合<select aria-label="Room Themeプレビュー集合" value={scope} onChange={e=>{setScope(e.target.value);setPage(0);}}><option value="solo">Room Theme単体</option><option value="combined">統合候補</option></select></label>
    <nav>{(['piece',...CONTENT_KINDS] as const).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>{setKind(k);setPage(0);}}>{k==='piece'?'Piece':CONTENT_LABELS[k]} ({k==='piece'?result.pieceCandidates.length:result.contentCandidates[k].length})</button>)}</nav>
    <div className="theme-candidates">{values.slice(actualPage*50,(actualPage+1)*50).map(v=><article key={v.id}><strong>{v.name}</strong><p>{'kind' in v?CONTENT_LABELS[v.kind]:v.shape} / {(v.tags??[]).join(', ')}</p>{'summary' in v&&<p>{v.summary}</p>}{'rotations' in v&&<p>適合回転: {v.rotations.map(r=>`${r}°`).join(', ')}</p>}<small>{v.id}</small></article>)}</div>
    <button disabled={!actualPage} onClick={()=>setPage(actualPage-1)}>前の候補</button><button disabled={(actualPage+1)*50>=values.length} onClick={()=>setPage(actualPage+1)}>次の候補</button>
    <h3>必須Content</h3><p>解決済み {combined.requiredContents.filter(r=>r.status==='resolved').length}件 / 未解決・種別不一致 {combined.requiredContents.filter(r=>r.status!=='resolved').length}件 / 制約競合 {combined.requiredContents.filter(r=>r.conflict).length}件</p>
    <ul>{combined.requiredContents.map(r=><li key={r.entry.id}>{r.content?.name??r.entry.contentId} / {CONTENT_LABELS[r.entry.expectedKind]} × {r.entry.quantity} / {r.status}{r.conflict?' / 選択条件と競合':''}</li>)}</ul>
    <details open={warnings.length>0}><summary>診断・警告 ({warnings.length})</summary><p>参照警告はテーマ保存・手動適用を妨げません。必須素材の未解決と種別不一致では一括配置を中止します。</p><ul>{warnings.slice(0,100).map((w,i)=><li key={i}>{w.scope}: {w.message}</li>)}</ul>{warnings.length>100&&<p>先頭100件を表示しています。</p>}</details>
  </section>;
}
