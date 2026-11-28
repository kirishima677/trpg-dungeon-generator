import {factionRepository} from '../../repository/factionRepository';
import type {FactionRepository} from '../../repository/factionRepository';
import type {FactionDefinition} from '../../model/faction';
import {useEffect,useMemo,useRef,useState} from 'react';
import {v4 as uuid} from 'uuid';
import {useDungeonStore} from '../../store';
import {useFactionLibrary} from './useFactionLibrary';
import {useThemeMaterials} from '../themes/useThemeMaterials';
import {useRoomThemeLibrary} from '../themes/useRoomThemeLibrary';
import {applyFactionCommand,factionDisplayName,emptyRoomFaction,RELATION_KINDS,RELATION_LABELS} from '../../model/factionState';
import type {FactionInstance,FactionCommand,FactionRelation} from '../../model/factionState';
import {factionStatistics,factionDiagnostics} from '../../model/factionResolver';
import {resolveFactionSelection} from '../../model/themeSelection';
import {searchThemes} from '../../themes/themeSearch';
import {ContentMarkdown} from '../content/ContentFields';

const newRelation=():FactionRelation=>({id:uuid(),factionAId:'',factionBId:'',kind:'unknown',gmNotes:''});

export function DungeonFactionPanel({close,repository=factionRepository}:{close:()=>void;repository?:FactionRepository}) {
  const dungeon=useDungeonStore(s=>s.dungeon),change=useDungeonStore(s=>s.changeFactions),library=useFactionLibrary(repository),materials=useThemeMaterials(),roomThemes=useRoomThemeLibrary();
  const [busy,setBusy]=useState(false),running=useRef(false),mounted=useRef(true),generation=useRef(0);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;generation.current++;};},[]);
  const [query,setQuery]=useState(''),[definition,setDefinition]=useState(''),[selected,setSelected]=useState('');
  const [draft,setDraft]=useState<FactionInstance|null>(null),[error,setError]=useState(''),[confirm,setConfirm]=useState<'delete'|'refresh'|'bulk'|null>(null);
  const [checked,setChecked]=useState<Set<string>>(new Set()),[relation,setRelation]=useState<FactionRelation>(newRelation);
  const current=dungeon.factions.find(f=>f.id===selected),dirty=!!draft&&!!current&&JSON.stringify(draft)!==JSON.stringify(current);
  const relationDirty=!!(relation.factionAId||relation.factionBId||relation.gmNotes||relation.kind!=='unknown');
  const stats=current?factionStatistics(dungeon,current.id):null;
  const diagnostics=useMemo(()=>factionDiagnostics(dungeon,materials.contents,roomThemes.themes),[dungeon,materials.contents,roomThemes.themes]);
  const candidates=dungeon.theme?resolveFactionSelection(dungeon.theme.themeSnapshot.factionSelection,library.themes):null;
  const run=(command:FactionCommand)=>{const result=change(command);setError(result??'');return !result;};
  const withDefinition=async(id:string,operation:(value:FactionDefinition)=>void,instanceId?:string)=>{
    if(running.current)return;running.current=true;setBusy(true);setError('');const token=++generation.current;
    try { const value=await repository.get(id);
      if(!mounted.current||generation.current!==token)return;
      const now=useDungeonStore.getState().dungeon;
      if(now.id!==dungeon.id||instanceId&&!now.factions.some(f=>f.id===instanceId&&f.sourceFactionId===id))throw new Error('対象のダンジョンまたは勢力が変わりました。操作し直してください。');
      if(!value)throw new Error('元の勢力定義がありません。登録済みのスナップショットは保持しています。');
      operation(value);
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'勢力定義を取得できませんでした。');}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  };
  const patch=(field:keyof FactionInstance,value:string)=>setDraft(d=>d?{...d,[field]:value}:d);
  const deletion=confirm==='delete'&&current?applyFactionCommand(dungeon,{type:'delete',id:current.id}):null;
  const related=current?dungeon.factionRelations.filter(r=>r.factionAId===current.id||r.factionBId===current.id):[];
  return <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="ダンジョンの勢力設定" className="faction-settings"><h2>ダンジョンの勢力設定</h2>
    <p>定義を登録すると、このダンジョン専用の勢力になります。同じ定義を複数回登録できます。</p>
    <button disabled={busy||dirty||relationDirty||!!confirm} onClick={close}>勢力設定を閉じる</button>{dirty&&<p role="status">未適用の変更があります。適用または破棄してください。</p>}
    {relationDirty&&<p role="status">未保存の勢力関係があります。保存または破棄してください。</p>}
    {busy&&<p role="status">勢力定義を読み込んでいます…</p>}
    {[error,library.error,materials.error,roomThemes.error].filter(Boolean).map((e,i)=><p role="alert" key={i}>{e}</p>)}
    <fieldset disabled={busy||dirty||relationDirty||!!confirm}><label>勢力定義の検索<input aria-label="勢力定義検索" value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <label>登録する勢力定義<select aria-label="登録する勢力定義" value={definition} onChange={e=>setDefinition(e.target.value)}><option value="">選択してください</option>{searchThemes(library.themes,query).map(f=><option key={f.id} value={f.id}>{f.name}{candidates&&!candidates.candidates.some(c=>c.id===f.id)?'（テーマ候補外）':''}</option>)}</select></label>
      <button disabled={!definition} onClick={()=>void withDefinition(definition,value=>{if(run({type:'add',definition:value})){const added=useDungeonStore.getState().dungeon.factions.at(-1)!;setSelected(added.id);setDraft(added);}})}>勢力を登録</button>
      <button onClick={()=>void library.reload()}>勢力定義一覧を再取得</button>
      <nav aria-label="登録勢力">{dungeon.factions.map(f=><button key={f.id} aria-pressed={selected===f.id} onClick={()=>{setSelected(f.id);setDraft(f);setError('');}}><span style={{color:f.mapColor}}>● </span>{factionDisplayName(f)}</button>)}</nav>
    </fieldset>
    {current&&draft&&<><h3>{factionDisplayName(current)}</h3><p>勢力ID: {current.id}</p>
      <p>単独支配 {stats!.controlled}部屋 / 係争 {stats!.contested}部屋 / Monster {stats!.monster.groups}組・{stats!.monster.quantity}体 / NPC {stats!.npc.groups}組・{stats!.npc.quantity}人 / 関係 {stats!.relations}件</p>
      <fieldset disabled={busy||!!confirm}>{([['customName','個別名称',200],['currentObjectives','現在の目的',20000],['currentSituation','現在の状況',20000],['gmNotes','勢力のGM情報',20000],['publicName','公開名称',200],['publicDescription','公開説明',20000]] as const).map(([field,label,max])=><label key={field}>{label}<textarea aria-label={field==='gmNotes'?label:`勢力${label}`} value={draft[field]} maxLength={max} onChange={e=>patch(field,e.target.value)} /></label>)}
      <label>マップの色<input aria-label="勢力の色" type="color" value={draft.mapColor} onChange={e=>patch('mapColor',e.target.value.toUpperCase())} /></label>
      <label>公開範囲<select aria-label="勢力公開範囲" value={draft.visibility} onChange={e=>patch('visibility',e.target.value)}><option value="gm-only">GM専用</option><option value="public">公開名称・公開説明のみ公開</option></select></label><p>公開しても所属・支配・関係・内部名称は公開しません。公開項目が空なら掲載しません。</p>
      <button onClick={()=>{if(run({type:'edit',id:current.id,edits:draft}))setDraft(useDungeonStore.getState().dungeon.factions.find(f=>f.id===current.id)!);}}>勢力情報を適用</button><button disabled={!dirty} onClick={()=>setDraft(current)}>勢力の変更を破棄</button>
      <button disabled={dirty||relationDirty} onClick={()=>run({type:'duplicate',id:current.id})}>勢力を複製</button><button disabled={dirty||relationDirty} onClick={()=>setConfirm('delete')}>勢力を削除</button>
      <button disabled={dirty||relationDirty||!library.themes.some(f=>f.id===current.sourceFactionId)} onClick={()=>setConfirm('refresh')}>勢力定義の最新版を反映</button>
      {!library.themes.some(f=>f.id===current.sourceFactionId)&&<p>元の勢力定義がありません。登録時点の情報は保持されています。</p>}
      <details><summary>登録時点の勢力定義</summary><p>{current.factionSnapshot.name} / {current.factionSnapshot.summary}</p><ContentMarkdown readOnly description={current.factionSnapshot.description} gmNotes={current.factionSnapshot.gmNotes} /><h4>目的</h4><p>{current.factionSnapshot.objectives}</p><h4>行動方針</h4><p>{current.factionSnapshot.behavior}</p></details>
      <details><summary>部屋の一括支配設定</summary><p>選んだ部屋の既存支配状態を上書きします。用途・GM情報は保持します。</p>{dungeon.rooms.map(r=>{const a=dungeon.roomFactionAssignments.find(a=>a.roomId===r.id),name=a?.controllingFactionId?factionDisplayName(dungeon.factions.find(f=>f.id===a.controllingFactionId)!):a?.status==='contested'?'係争中':'無所属';return <label key={r.id}><input type="checkbox" aria-label={`部屋${r.information.number}を一括設定`} checked={checked.has(r.id)} onChange={e=>setChecked(old=>{const next=new Set(old);if(e.target.checked)next.add(r.id);else next.delete(r.id);return next;})} />{r.information.number} {r.information.name} / 現在: {name}</label>;})}<button disabled={dirty||relationDirty||!checked.size} onClick={()=>setConfirm('bulk')}>一括支配設定を確認</button></details>
      <h4>勢力関係</h4>{related.map(r=><article key={r.id}><p>{factionDisplayName(dungeon.factions.find(f=>f.id===(r.factionAId===current.id?r.factionBId:r.factionAId))!)}: {RELATION_LABELS[r.kind]} / {r.gmNotes}</p><button disabled={dirty||relationDirty} onClick={()=>setRelation({...r})}>関係を編集</button><button disabled={dirty||relationDirty} onClick={()=>run({type:'delete-relation',id:r.id})}>関係を解除</button></article>)}
      <label>関係の相手<select aria-label="関係の相手" value={relation.factionAId===current.id?relation.factionBId:relation.factionBId===current.id?relation.factionAId:''} onChange={e=>setRelation({id:uuid(),factionAId:current.id,factionBId:e.target.value,kind:'unknown',gmNotes:''})}><option value="">相手を選択</option>{dungeon.factions.filter(f=>f.id!==current.id).map(f=><option key={f.id} value={f.id}>{factionDisplayName(f)}</option>)}</select></label>
      <label>関係<select aria-label="勢力関係の種別" value={relation.kind} onChange={e=>setRelation({...relation,kind:e.target.value as FactionRelation['kind']})}>{RELATION_KINDS.map(k=><option key={k} value={k}>{RELATION_LABELS[k]}</option>)}</select></label><label>関係のGM情報<textarea aria-label="関係のGM情報" maxLength={20000} value={relation.gmNotes} onChange={e=>setRelation({...relation,gmNotes:e.target.value})} /></label>
      <button disabled={dirty||!relation.factionAId||!relation.factionBId||![relation.factionAId,relation.factionBId].includes(current.id)} onClick={()=>{if(run({type:'relation',relation}))setRelation(newRelation());}}>関係を保存</button><button disabled={!relationDirty} onClick={()=>setRelation(newRelation())}>関係の変更を破棄</button></fieldset>
      {confirm&&<section role="alertdialog" aria-modal="true" aria-label="勢力変更の確認"><h3>{confirm==='delete'?'勢力を削除しますか？':confirm==='refresh'?'定義のスナップショットを更新しますか？':'支配設定を上書きしますか？'}</h3>
        {confirm==='delete'?<p>単独支配 {stats!.controlled}部屋は無所属へ、係争 {stats!.contested}部屋は残った勢力数に応じて再設定します。Entity {stats!.monster.groups+stats!.npc.groups}組の所属と関係 {stats!.relations}件を解除します。部屋・Entity・定義は削除しません。</p>:confirm==='refresh'?<p>名称などの個別情報・支配・所属・関係は保持し、定義だけを更新します。</p>:<ul>{dungeon.rooms.filter(r=>checked.has(r.id)).map(r=><li key={r.id}>部屋{r.information.number}: {dungeon.roomFactionAssignments.find(a=>a.roomId===r.id)?.status??'unclaimed'} → {factionDisplayName(current)}の単独支配</li>)}</ul>}
        {deletion&&<><h4>支配設定の変更予定</h4><ul>{dungeon.roomFactionAssignments.filter(a=>a.controllingFactionId===current.id||a.contestingFactionIds.includes(current.id)).map(a=>{const next=deletion.roomFactionAssignments.find(v=>v.roomId===a.roomId)!;return <li key={a.roomId}>部屋{dungeon.rooms.find(r=>r.id===a.roomId)!.information.number}: {a.status==='controlled'?'単独支配':'係争中'} → {next.status==='unclaimed'?'無所属':next.status==='contested'?`係争中（${next.contestingFactionIds.length}勢力）`:`単独支配: ${factionDisplayName(dungeon.factions.find(f=>f.id===next.controllingFactionId)!)}`}</li>;})}</ul><h4>所属を解除するEntity</h4><ul>{dungeon.entities.filter(e=>e.factionId===current.id).map(e=><li key={e.id}>部屋{dungeon.rooms.find(r=>r.id===e.roomId)!.information.number}: {e.customName||e.contentSnapshot.name} × {e.quantity}</li>)}</ul><h4>解除する関係</h4><ul>{related.map(r=><li key={r.id}>{factionDisplayName(dungeon.factions.find(f=>f.id===(r.factionAId===current.id?r.factionBId:r.factionAId))!)}: {RELATION_LABELS[r.kind]}</li>)}</ul></>}
        <button disabled={busy} onClick={()=>{
          if(confirm==='refresh'){void withDefinition(current.sourceFactionId,latest=>{if(run({type:'refresh',id:current.id,definition:latest})){setConfirm(null);setDraft(useDungeonStore.getState().dungeon.factions.find(f=>f.id===current.id)!);}},current.id);return;}
          let success=false;
          if(confirm==='delete')success=run({type:'delete',id:current.id});
          else success=run({type:'assign-rooms',assignments:[...checked].map(roomId=>({...dungeon.roomFactionAssignments.find(a=>a.roomId===roomId)??emptyRoomFaction(roomId),status:'controlled',controllingFactionId:current.id,contestingFactionIds:[]}))});
          if(success){setConfirm(null);if(confirm==='delete'){setSelected('');setDraft(null);}else setDraft(useDungeonStore.getState().dungeon.factions.find(f=>f.id===current.id)!);}
        }}>勢力変更を確定</button><button disabled={busy} onClick={()=>setConfirm(null)}>キャンセル</button></section>}
    </>}
    <details><summary>整合性の診断（{diagnostics.length}件・操作は制限しません）</summary><ul>{diagnostics.slice(0,200).map(w=><li key={w}>{w}</li>)}</ul></details>
  </section></div>;
}
