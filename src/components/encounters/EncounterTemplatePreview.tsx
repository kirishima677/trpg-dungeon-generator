import {useEffect,useMemo,useState} from 'react';
import type {EncounterTemplateDraft} from '../../model/encounter/template';
import type {ContentDefinition} from '../../model/content';
import type {DungeonDocument} from '../../model/types';
import {dungeonRepository} from '../../repository/dungeonRepository';
import {resolveEncounter} from '../../model/encounter/resolver';
import {createConnectionSceneResolver} from '../../editor/connectors/corridor/connectionScene';
import {EncounterApplication} from './EncounterApplication';
export function EncounterTemplatePreview({draft,contents}:{draft:EncounterTemplateDraft;contents:ContentDefinition[]}) {
 const [dungeons,setDungeons]=useState<DungeonDocument[]>([]),[dungeonId,setDungeonId]=useState(''),[roomId,setRoomId]=useState(''),[error,setError]=useState(''),[sceneResolver]=useState(createConnectionSceneResolver);
 useEffect(()=>{let active=true;const reload=()=>{void dungeonRepository.list().then(values=>{if(active){setDungeons(values);setError('');}}).catch(e=>{if(active)setError((e as Error).message);});};reload();window.addEventListener('focus',reload);return ()=>{active=false;window.removeEventListener('focus',reload);};},[]);
 const dungeon=dungeons.find(d=>d.id===dungeonId),scene=useMemo(()=>dungeon?sceneResolver(dungeon.rooms,dungeon.connections):null,[dungeon,sceneResolver]);
 const successfulConnectionIds=useMemo(()=>scene?new Set(scene.drawings.filter(d=>d.result.status==='success'&&(d.connection.type!=='corridor'||d.corridor?.status==='success')).map(d=>d.connection.id)):undefined,[scene]);
 const context=useMemo(()=>dungeon&&roomId?{dungeon,roomId,contents,successfulConnectionIds}:null,[dungeon,roomId,contents,successfulConnectionIds]),standalone=useMemo(()=>resolveEncounter(draft,undefined,[],contents),[draft,contents]);
 const template={...draft,createdAt:'2000-01-01T00:00:00.000Z',updatedAt:'2000-01-01T00:00:00.000Z'};
 return <section><p>分類: {draft.category} / Role {draft.factionRoles.length} / 関係条件 {draft.factionRelations.length}件</p><p>単体プレビューは具体的な部屋・勢力の成立可否を評価していません。</p><ul>{standalone.entries.map(({entry,candidates})=><li key={entry.id}>{entry.label} / {entry.kind} / {entry.required?'必須':'任意'} / 数量{entry.quantity.min}〜{entry.quantity.max} / 候補 {candidates.length}件<ul>{candidates.slice(0,50).map(c=><li key={c.id}>{c.name} / {c.id}</li>)}</ul></li>)}</ul><ul>{standalone.warnings.slice(0,100).map(w=><li key={w}>{w}</li>)}</ul>{error&&<p role="alert">{error}</p>}
 <label>検証用の保存済みダンジョン<select aria-label="Encounterプレビューのダンジョン" value={dungeonId} onChange={e=>{setDungeonId(e.target.value);setRoomId('');}}><option value="">単体のみ</option>{dungeons.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{dungeon&&<label>対象部屋<select aria-label="Encounterプレビューの部屋" value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">選択してください</option>{dungeon.rooms.map(r=><option key={r.id} value={r.id}>{r.information.number} {r.information.name}</option>)}</select></label>}
 {context&&<EncounterApplication key={`${draft.id}:${roomId}:${JSON.stringify(draft)}`} template={template} context={context} />}</section>;
}
