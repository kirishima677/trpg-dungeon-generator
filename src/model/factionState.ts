import { v4 as uuid } from 'uuid';
import type { FactionDefinition } from './faction';
import { FACTION_LIMITS, normalizeFaction } from './faction';
import { themeText } from './dungeonTheme';
import { selectionRecord } from './themeSelection';
import type { DungeonDocument } from './types';
import type { EntityInstance } from './entity';
export const FACTION_COLORS=['#BA6157','#557BB5','#59966D','#B48A43','#9166AD','#4B9999','#B26D96','#8C8972'] as const;
export const RELATION_KINDS=['allied','friendly','neutral','rival','hostile','unknown'] as const;
export const RELATION_LABELS:Record<FactionRelation['kind'],string>={allied:'同盟',friendly:'友好',neutral:'中立',rival:'競合',hostile:'敵対',unknown:'不明'};
export interface FactionInstance {
  id:string;sourceFactionId:string;factionSnapshot:FactionDefinition;customName:string;currentObjectives:string;currentSituation:string;gmNotes:string;
  mapColor:string;visibility:'gm-only'|'public';publicName:string;publicDescription:string;
}
export interface FactionRelation {id:string;factionAId:string;factionBId:string;kind:typeof RELATION_KINDS[number];gmNotes:string}
export interface RoomFactionAssignment {roomId:string;status:'unclaimed'|'controlled'|'contested';controllingFactionId?:string;contestingFactionIds:string[];currentUse:string;gmNotes:string}
export interface FactionState {factions:FactionInstance[];factionRelations:FactionRelation[];roomFactionAssignments:RoomFactionAssignment[]}
export type FactionEdits=Omit<FactionInstance,'id'|'sourceFactionId'|'factionSnapshot'>;
const id=(v:unknown)=>themeText(v,'勢力参照ID',128,true);
export const factionDisplayName=(f:FactionInstance)=>f.customName.trim()||f.factionSnapshot.name;
export function normalizeFactionInstance(value:unknown):FactionInstance {
  const r=selectionRecord(value),factionSnapshot=normalizeFaction(r.factionSnapshot);
  if(r.sourceFactionId!==factionSnapshot.id)throw new Error('勢力定義とスナップショットのIDが一致しません。');
  if(typeof r.mapColor!=='string'||!/^#[0-9a-f]{6}$/i.test(r.mapColor))throw new Error('勢力の色は#RRGGBBで指定してください。');
  if(r.visibility!=='gm-only'&&r.visibility!=='public')throw new Error('勢力の公開範囲が不正です。');
  return {id:id(r.id),sourceFactionId:id(r.sourceFactionId),factionSnapshot,customName:themeText(r.customName,'個別名称',200),
    currentObjectives:themeText(r.currentObjectives,'現在の目的',FACTION_LIMITS.localMarkdown),currentSituation:themeText(r.currentSituation,'現在の状況',FACTION_LIMITS.localMarkdown),gmNotes:themeText(r.gmNotes,'勢力のGM情報',FACTION_LIMITS.localMarkdown),
    mapColor:r.mapColor.toUpperCase(),visibility:r.visibility,publicName:themeText(r.publicName,'公開名称',200),publicDescription:themeText(r.publicDescription,'公開説明',FACTION_LIMITS.localMarkdown)};
}
export function createFactionInstance(faction:FactionDefinition,index=0):FactionInstance {
  return normalizeFactionInstance({id:uuid(),sourceFactionId:faction.id,factionSnapshot:faction,customName:'',currentObjectives:'',currentSituation:'',gmNotes:'',mapColor:FACTION_COLORS[index%FACTION_COLORS.length],visibility:'gm-only',publicName:'',publicDescription:''});
}
export function emptyRoomFaction(roomId:string):RoomFactionAssignment {return {roomId,status:'unclaimed',contestingFactionIds:[],currentUse:'',gmNotes:''};}
export function normalizeRoomFaction(value:unknown,roomIds:ReadonlySet<string>,factionIds:ReadonlySet<string>):RoomFactionAssignment {
  const r=selectionRecord(value),roomId=id(r.roomId);
  if(!roomIds.has(roomId))throw new Error('支配対象の部屋が見つかりません。');
  if(!['unclaimed','controlled','contested'].includes(r.status as string))throw new Error('部屋の支配状態が不正です。');
  if(!Array.isArray(r.contestingFactionIds)||r.contestingFactionIds.length>FACTION_LIMITS.contesting)throw new Error(`係争勢力は${FACTION_LIMITS.contesting}件までです。`);
  const contestants=r.contestingFactionIds.map(id),controller=r.controllingFactionId===undefined?undefined:id(r.controllingFactionId);
  if(new Set(contestants).size!==contestants.length || [...contestants,...(controller?[controller]:[])].some(f=>!factionIds.has(f)))throw new Error('支配勢力の参照が不正または重複しています。');
  if(r.status==='unclaimed'&&(controller||contestants.length)||r.status==='controlled'&&(!controller||contestants.length)||r.status==='contested'&&(controller||contestants.length<2))throw new Error('支配状態と勢力の組み合わせが不正です。');
  return {roomId,status:r.status as RoomFactionAssignment['status'],...(controller?{controllingFactionId:controller}:{}),contestingFactionIds:contestants,currentUse:themeText(r.currentUse,'現在の用途',2000),gmNotes:themeText(r.gmNotes,'支配のGM情報',FACTION_LIMITS.localMarkdown)};
}
function array(value:unknown,max:number):unknown[] {if(value===undefined)return [];if(!Array.isArray(value)||value.length>max)throw new Error(`勢力データは${max}件までの配列で指定してください。`);return value;}
export function normalizeFactionState(value:{factions?:unknown;factionRelations?:unknown;roomFactionAssignments?:unknown},rooms:readonly {id:string}[],entities:readonly EntityInstance[]):FactionState {
  const factions=array(value.factions,FACTION_LIMITS.instances).map(normalizeFactionInstance),ids=new Set(factions.map(f=>f.id));
  if(ids.size!==factions.length)throw new Error('勢力インスタンスIDが重複しています。');
  const relationIds=new Set<string>(),pairs=new Set<string>();
  const factionRelations=array(value.factionRelations,FACTION_LIMITS.relations).map(value=>{
    const r=selectionRecord(value),relationId=id(r.id),[a,b]=[id(r.factionAId),id(r.factionBId)].sort(),pair=JSON.stringify([a,b]);
    if(!ids.has(a)||!ids.has(b)||a===b||pairs.has(pair)||relationIds.has(relationId)||!RELATION_KINDS.includes(r.kind as FactionRelation['kind']))throw new Error('勢力関係の参照・種別・重複が不正です。');
    relationIds.add(relationId);pairs.add(pair);return {id:relationId,factionAId:a,factionBId:b,kind:r.kind as FactionRelation['kind'],gmNotes:themeText(r.gmNotes,'関係のGM情報',FACTION_LIMITS.localMarkdown)};
  });
  const seenRooms=new Set<string>(),roomIds=new Set(rooms.map(r=>r.id));
  const roomFactionAssignments=array(value.roomFactionAssignments,FACTION_LIMITS.assignments).map(v=>{
    const a=normalizeRoomFaction(v,roomIds,ids);if(seenRooms.has(a.roomId))throw new Error('部屋の支配設定が重複しています。');seenRooms.add(a.roomId);return a;
  });
  for(const e of entities)if(e.factionId!==undefined&&(!ids.has(e.factionId)||!['monster','npc'].includes(e.contentSnapshot.kind)))throw new Error('Entityの所属勢力または種別が不正です。');
  const result={factions,factionRelations,roomFactionAssignments};if(new TextEncoder().encode(JSON.stringify(result)).length>FACTION_LIMITS.stateBytes)throw new Error('勢力データは合計8 MiBまでです。');return result;
}
export type FactionCommand=
 |{type:'add';definition:FactionDefinition}|{type:'edit';id:string;edits:FactionEdits}|{type:'duplicate';id:string}|{type:'refresh';id:string;definition:FactionDefinition}|{type:'delete';id:string}
 |{type:'relation';relation:FactionRelation}|{type:'delete-relation';id:string}|{type:'assign-rooms';assignments:RoomFactionAssignment[]};
/** One complete, validated change; callers commit it to history once. */
export function applyFactionCommand(dungeon:DungeonDocument,command:FactionCommand):FactionState & {entities:EntityInstance[]} {
  let {factions,factionRelations,roomFactionAssignments,entities}=dungeon;
  if(command.type==='add')factions=[...factions,createFactionInstance(command.definition,factions.length)];
  else if(command.type==='relation')factionRelations=[...factionRelations.filter(r=>r.id!==command.relation.id),command.relation];
  else if(command.type==='delete-relation')factionRelations=factionRelations.filter(r=>r.id!==command.id);
  else if(command.type==='assign-rooms') {
    const incoming=new Set(command.assignments.map(a=>a.roomId));if(incoming.size!==command.assignments.length)throw new Error('一括設定の部屋が重複しています。');
    roomFactionAssignments=[...roomFactionAssignments.filter(a=>!incoming.has(a.roomId)),...command.assignments];
  } else {
    const f=factions.find(f=>f.id===command.id);if(!f)throw new Error('勢力が見つかりません。');
    if(command.type==='delete') {
      factions=factions.filter(v=>v.id!==f.id);factionRelations=factionRelations.filter(r=>r.factionAId!==f.id&&r.factionBId!==f.id);
      roomFactionAssignments=roomFactionAssignments.map(a=>{
        if(a.controllingFactionId===f.id)return {...emptyRoomFaction(a.roomId),currentUse:a.currentUse,gmNotes:a.gmNotes};
        if(!a.contestingFactionIds.includes(f.id))return a;
        const remaining=a.contestingFactionIds.filter(i=>i!==f.id);
        return {...a,status:remaining.length>=2?'contested':remaining.length===1?'controlled':'unclaimed',controllingFactionId:remaining.length===1?remaining[0]:undefined,contestingFactionIds:remaining.length>=2?remaining:[]} as RoomFactionAssignment;
      });
      entities=entities.map(e=>{if(e.factionId!==f.id)return e;const {factionId:_removed,...rest}=e;return rest;});
    } else if(command.type==='duplicate')factions=[...factions,normalizeFactionInstance({...f,id:uuid(),mapColor:FACTION_COLORS[factions.length%FACTION_COLORS.length]})];
    else if(command.type==='refresh') {
      if(command.definition.id!==f.sourceFactionId)throw new Error('元の勢力定義IDが異なります。');
      factions=factions.map(v=>v.id===f.id?normalizeFactionInstance({...v,factionSnapshot:command.definition}):v);
    } else factions=factions.map(v=>v.id===f.id?normalizeFactionInstance({...v,...command.edits,id:v.id,sourceFactionId:v.sourceFactionId,factionSnapshot:v.factionSnapshot}):v);
  }
  return {...normalizeFactionState({factions,factionRelations,roomFactionAssignments},dungeon.rooms,entities),entities};
}
