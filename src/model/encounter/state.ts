import {encounterContextSnapshot,resolveEncounter} from './resolver';
import type {DungeonDocument} from '../types';
import type {EntityInstance,EntityVisibility} from '../entity';
import {themeText} from '../dungeonTheme';
import {selectionRecord} from '../themeSelection';
import type {EncounterTemplate} from './template';
import {ENCOUNTER_LIMITS,encounterArray,encounterId,normalizeEncounterTemplate} from './template';
import type {FactionRoleBinding} from './resolver';
export interface EncounterContextSnapshot {roomThemeRevision:string;controlRevision:string;relationsRevision:string}
export interface EncounterInstance {creationContext?:EncounterContextSnapshot;id:string;roomId:string;sourceEncounterId:string;encounterSnapshot:EncounterTemplate;factionBindings:FactionRoleBinding[];customName:string;situation:string;objectives:string;gmNotes:string;visibility:EntityVisibility;publicDescription:string;acceptedWarnings:string[]}
export type EncounterEdits=Pick<EncounterInstance,'customName'|'situation'|'objectives'|'gmNotes'|'visibility'|'publicDescription'>;
export const encounterDisplayName=(e:EncounterInstance)=>e.customName.trim()||e.encounterSnapshot.name;
export function normalizeEncounterEdits(value:unknown):EncounterEdits {const r=selectionRecord(value);if(r.visibility!=='gm-only'&&r.visibility!=='public')throw new Error('Encounter公開範囲が不正です。');return {customName:themeText(r.customName,'Encounter個別名称',200),situation:themeText(r.situation,'現在の状況',100000),objectives:themeText(r.objectives,'現在の目的',100000),gmNotes:themeText(r.gmNotes,'Encounter GM情報',100000),publicDescription:themeText(r.publicDescription,'Encounter公開説明',20000),visibility:r.visibility};}
export function normalizeEncounters(values:unknown,rooms:readonly {id:string}[],factions:readonly {id:string}[],entities:readonly EntityInstance[]):EncounterInstance[] {
 const ids=new Set<string>(),roomIds=new Set(rooms.map(r=>r.id)),factionIds=new Set(factions.map(f=>f.id)),counts=new Map<string,number>();
 const encounters=encounterArray(values===undefined?[]:values,ENCOUNTER_LIMITS.total).map(value=>{
  const r=selectionRecord(value),id=encounterId(r.id),roomId=encounterId(r.roomId),encounterSnapshot=normalizeEncounterTemplate(r.encounterSnapshot);
  if(ids.has(id)||!roomIds.has(roomId)||r.sourceEncounterId!==encounterSnapshot.id)throw new Error('Encounter ID・部屋・Snapshot参照が不正です。');ids.add(id);
  const count=(counts.get(roomId)??0)+1;if(count>ENCOUNTER_LIMITS.perRoom)throw new Error(`Encounterは1部屋${ENCOUNTER_LIMITS.perRoom}件までです。`);counts.set(roomId,count);
  const seenRoles=new Set<string>(),bound=new Set<string>();const factionBindings=encounterArray(r.factionBindings,ENCOUNTER_LIMITS.roles).map(value=>{const b=selectionRecord(value),roleId=encounterId(b.roleId),factionId=b.factionId===undefined?undefined:encounterId(b.factionId);if(seenRoles.has(roleId)||!encounterSnapshot.factionRoles.some(role=>role.id===roleId)||factionId&&(!factionIds.has(factionId)||bound.has(factionId)))throw new Error('EncounterのRole Binding参照が不正です。');seenRoles.add(roleId);if(factionId)bound.add(factionId);return {roleId,...(factionId?{factionId}:{})};});
  return {id,roomId,sourceEncounterId:encounterSnapshot.id,encounterSnapshot,factionBindings,...normalizeEncounterEdits(r),...(r.creationContext===undefined?{}:{creationContext:Object.fromEntries(['roomThemeRevision','controlRevision','relationsRevision'].map(k=>[k,themeText(selectionRecord(r.creationContext)[k],'生成時の条件',20000)])) as unknown as EncounterContextSnapshot}),acceptedWarnings:encounterArray(r.acceptedWarnings,ENCOUNTER_LIMITS.warnings).map(v=>themeText(v,'受け入れた診断',2000))};
 });
 const byId=new Map(encounters.map(e=>[e.id,e]));for(const entity of entities)if(entity.origin?.type==='encounter'){const encounter=byId.get(entity.origin.encounterInstanceId);if(!encounter||encounter.roomId!==entity.roomId||!encounter.encounterSnapshot.entries.some(e=>e.id===(entity.origin?.type==='encounter'?entity.origin.entryId:'')))throw new Error('EntityのEncounter由来参照が不正です。');}
 if(new TextEncoder().encode(JSON.stringify(encounters)).length>ENCOUNTER_LIMITS.stateBytes)throw new Error('Encounter一覧は合計8 MiBまでです。');return encounters;
}
export function encounterDiagnostics(dungeon:DungeonDocument,encounter:EncounterInstance):string[] {
 const warnings:string[]=[],entities=dungeon.entities.filter(e=>e.origin?.type==='encounter'&&e.origin.encounterInstanceId===encounter.id),bindings=new Map(encounter.factionBindings.map(b=>[b.roleId,b.factionId]));
 for(const role of encounter.encounterSnapshot.factionRoles)if(role.required&&!bindings.get(role.id))warnings.push(`必須Role「${role.name}」が未解決です。`);
 for(const entry of encounter.encounterSnapshot.entries){const matching=entities.filter(e=>e.origin?.type==='encounter'&&e.origin.entryId===entry.id);if(entry.required&&!matching.length)warnings.push(`必須Entry「${entry.label}」のEntityがありません。`);for(const entity of matching){if(entity.quantity<entry.quantity.min||entity.quantity>entry.quantity.max)warnings.push(`${entry.label}: 数量が範囲外です。`);if(entry.factionRoleId&&entity.factionId!==bindings.get(entry.factionRoleId))warnings.push(`${entry.label}: 現在の所属が生成時のRole Bindingと異なります。`);}}
 const context={dungeon,roomId:encounter.roomId,contents:entities.map(e=>e.contentSnapshot)};
 warnings.push(...resolveEncounter(encounter.encounterSnapshot,context,encounter.factionBindings).conditionWarnings);
 if(encounter.creationContext){const current=encounterContextSnapshot(context,encounter.encounterSnapshot,encounter.factionBindings);if(current.roomThemeRevision!==encounter.creationContext.roomThemeRevision)warnings.push('生成後にRoom Themeが変更されています。');if(current.controlRevision!==encounter.creationContext.controlRevision)warnings.push('生成後に部屋の支配状態が変更されています。');if(current.relationsRevision!==encounter.creationContext.relationsRevision)warnings.push('生成後に参加勢力の割り当てまたは関係が変更されています。');}
 return [...new Set(warnings)];
}
