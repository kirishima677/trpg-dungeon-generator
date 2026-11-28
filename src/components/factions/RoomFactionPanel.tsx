import {useState} from 'react';
import {useDungeonStore} from '../../store';
import {emptyRoomFaction,factionDisplayName} from '../../model/factionState';
import type {RoomFactionAssignment} from '../../model/factionState';
export function RoomFactionPanel({roomId}:{roomId:string}) {
  const dungeon=useDungeonStore(s=>s.dungeon),change=useDungeonStore(s=>s.changeFactions);
  const saved=dungeon.roomFactionAssignments.find(a=>a.roomId===roomId)??emptyRoomFaction(roomId);
  const [draft,setDraft]=useState(saved),[error,setError]=useState('');
  return <section className="room-faction-panel" aria-label="部屋の勢力設定"><h3>部屋の支配状態</h3><p>支配とEntityの所属は独立しています。</p>
    <label>支配状態<select aria-label="支配状態" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as RoomFactionAssignment['status'],controllingFactionId:undefined,contestingFactionIds:[]})}><option value="unclaimed">無所属</option><option value="controlled">単独支配</option><option value="contested">係争中</option></select></label>
    {draft.status==='controlled'&&<label>支配勢力<select aria-label="支配勢力" value={draft.controllingFactionId??''} onChange={e=>setDraft({...draft,controllingFactionId:e.target.value||undefined})}><option value="">選択してください</option>{dungeon.factions.map(f=><option key={f.id} value={f.id}>{factionDisplayName(f)}</option>)}</select></label>}
    {draft.status==='contested'&&<fieldset><legend>係争勢力（2つ以上）</legend>{dungeon.factions.map(f=><label className="faction-contestant" key={f.id}><input type="checkbox" checked={draft.contestingFactionIds.includes(f.id)} onChange={e=>setDraft({...draft,contestingFactionIds:e.target.checked?[...draft.contestingFactionIds,f.id]:draft.contestingFactionIds.filter(id=>id!==f.id)})} />{factionDisplayName(f)}</label>)}</fieldset>}
    <label>現在の用途<textarea aria-label="現在の用途" maxLength={2000} value={draft.currentUse} onChange={e=>setDraft({...draft,currentUse:e.target.value})} /></label>
    <label>支配のGM情報<textarea aria-label="支配のGM情報" maxLength={20000} value={draft.gmNotes} onChange={e=>setDraft({...draft,gmNotes:e.target.value})} /></label>
    <button onClick={()=>setError(change({type:'assign-rooms',assignments:[draft]})??'')}>支配設定を適用</button><button onClick={()=>{setDraft(saved);setError('');}}>支配設定の変更を破棄</button>{error&&<p role="alert">{error}</p>}
  </section>;
}
