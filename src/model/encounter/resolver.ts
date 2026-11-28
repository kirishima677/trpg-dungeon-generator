import {intersectById} from '../selectionSets';
import type {Diagnostic} from '../diagnostic';
import type {SelectionWarning} from '../themeSelection';
import type {DungeonDocument} from '../types';
import type {ContentDefinition} from '../content';
import type {FactionInstance} from '../factionState';
import {resolveContentSelection,resolveEncounterSelection,resolveFactionSelection,resolveDungeonThemeSelection,resolveRoomThemeSelection,emptyContentSelection} from '../themeSelection';
import type {EncounterTemplateDraft,EncounterContentEntry} from './template';
import {ENCOUNTER_LIMITS} from './template';
import {resolveFaction} from '../factionResolver';
export type EncounterDiagnosticCode = 'room-missing'|'binding-invalid'|'binding-duplicate-faction'|'role-unbound'|'role-missing-faction'|'role-condition'|'dungeon-theme-condition'|'room-theme-condition'|'dungeon-encounter-policy'|'room-encounter-policy'|'control-condition'|'room-cells-condition'|'connections-unevaluated'|'connections-condition'|'faction-relation-condition'|'entry-content-invalid'|'entry-empty-candidates'|'entry-excluded-dungeon'|'entry-excluded-room'|'entry-excluded-faction'|`selection-${SelectionWarning['code']}`;
export type EncounterDiagnostic=Diagnostic<EncounterDiagnosticCode>;
export interface FactionRoleBinding {roleId:string;factionId?:string}
export interface EncounterContext {dungeon:DungeonDocument;roomId:string;contents:readonly ContentDefinition[];successfulConnectionIds?:ReadonlySet<string>}
export interface ResolvedEncounterEntry {entry:EncounterContentEntry;candidates:ContentDefinition[];choices:ContentDefinition[]}
const samePair=(a:string,b:string,x:string,y:string)=>a===x&&b===y||a===y&&b===x;
function relation(d:DungeonDocument,a:string,b:string) {return d.factionRelations.find(r=>samePair(a,b,r.factionAId,r.factionBId))?.kind??'unknown';}
/** Reuses existing derived successful routes; the Resolver never performs routing. */
export function connectedRoomCount(context:EncounterContext):number|undefined {
 if(!context.successfulConnectionIds)return undefined;
 return new Set(context.dungeon.connections.filter(c=>context.successfulConnectionIds!.has(c.id)&&(c.fromRoomId===context.roomId||c.toRoomId===context.roomId)).map(c=>c.fromRoomId===context.roomId?c.toRoomId:c.fromRoomId)).size;
}
export function resolveEncounter(template:EncounterTemplateDraft,context?:EncounterContext,bindings:readonly FactionRoleBinding[]=[],standaloneContents:readonly ContentDefinition[]=[]) {
 const diagnostics:EncounterDiagnostic[]=[],errors:string[]=[],warnings:string[]=[],d=context?.dungeon,room=d?.rooms.find(r=>r.id===context?.roomId),bindingMap=new Map(bindings.map(b=>[b.roleId,b.factionId]));
 const report=(code:EncounterDiagnosticCode,message:string,severity:EncounterDiagnostic['severity'],category:EncounterDiagnostic['category'],context:EncounterDiagnostic['context']={})=>{diagnostics.push({code,message,severity,category,context:{...(room?{roomId:room.id}:{}),...context}});(severity==='error'?errors:warnings).push(message);};
 const error=(code:EncounterDiagnosticCode,message:string,category:EncounterDiagnostic['category']='reference',context?:EncounterDiagnostic['context'])=>report(code,message,'error',category,context);
 const warn=(code:EncounterDiagnosticCode,message:string,category:EncounterDiagnostic['category']='condition',context?:EncounterDiagnostic['context'])=>report(code,message,'warning',category,context);
 if(context&&!room)error('room-missing','対象の部屋がありません。');if(bindingMap.size!==bindings.length||bindings.some(b=>!template.factionRoles.some(r=>r.id===b.roleId)))error('binding-invalid','Role Bindingが重複または不正です。','structure');
 const assigned=bindings.flatMap(b=>b.factionId?[b.factionId]:[]);if(new Set(assigned).size!==assigned.length)error('binding-duplicate-faction','異なるRoleへ同じ勢力は割り当てられません。','structure');
 const control=d?.roomFactionAssignments.find(a=>a.roomId===room?.id),status=control?.status??'unclaimed';
 if(room&&d){
  const a=template.applicability,dt=d.theme?.themeSnapshot,rt=room.roomTheme?.themeSnapshot;
  if(dt?!resolveDungeonThemeSelection(a.dungeonThemeSelection,[dt]).candidates.length:a.dungeonThemeSelection.mode!=='all'||a.dungeonThemeSelection.excludeDungeonThemeIds.length>0||a.dungeonThemeSelection.tags.noneOf.length>0)warn('dungeon-theme-condition','Dungeon Theme適用条件に一致しません。');
  if(rt?!resolveRoomThemeSelection(a.roomThemeSelection,[rt]).candidates.length:a.roomThemeSelection.mode!=='all'||a.roomThemeSelection.excludeRoomThemeIds.length>0||a.roomThemeSelection.tags.noneOf.length>0)warn('room-theme-condition','Room Theme適用条件に一致しません。');
  if(dt&&!resolveEncounterSelection(dt.encounterSelection,[template]).candidates.length)warn('dungeon-encounter-policy','Dungeon ThemeのEncounter候補外です。');
  if(rt&&!resolveEncounterSelection(rt.encounterSelection,[template]).candidates.length)warn('room-encounter-policy','Room ThemeのEncounter候補外です。');
  if(a.allowedControlStatuses.length&&!a.allowedControlStatuses.includes(status))warn('control-condition','部屋の支配状態が適用条件と一致しません。');
  const cells=new Set(room.piece.cells.map(c=>`${c.x},${c.y}`)).size;
  if(a.minRoomCells!==undefined&&cells<a.minRoomCells||a.maxRoomCells!==undefined&&cells>a.maxRoomCells)warn('room-cells-condition','部屋の占有セル数が条件範囲外です。');
  const neighbors=connectedRoomCount(context!);if(a.minConnectedRooms!==undefined||a.maxConnectedRooms!==undefined){if(neighbors===undefined)error('connections-unevaluated','接続条件の判定未完了です。正常な経路の情報が必要です。','evaluation');else if(a.minConnectedRooms!==undefined&&neighbors<a.minConnectedRooms||a.maxConnectedRooms!==undefined&&neighbors>a.maxConnectedRooms)warn('connections-condition','正常な経路で直接接続した部屋数が条件範囲外です。');}
 }
 const factionRoles=template.factionRoles.map(role=>{
  const choices=[...(d?.factions??[])].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const candidates=choices.filter(f=>{
   const matches=resolveFactionSelection(role.factionSelection,[f.factionSnapshot]).candidates.length>0;
   const location=role.bindingType==='any-faction'||role.bindingType==='room-controller'&&control?.controllingFactionId===f.id||role.bindingType==='room-contender'&&!!control?.contestingFactionIds.includes(f.id);
   const primary=role.id!==template.primaryFactionRoleId||resolveEncounterSelection(f.factionSnapshot.encounterSelection,[template]).candidates.length>0;
   return matches&&location&&primary;
  });
  const factionId=bindingMap.get(role.id),faction=choices.find(f=>f.id===factionId);
  if(context&&role.required&&!factionId)error('role-unbound',`必須Role「${role.name}」を割り当ててください。`,'reference',{roleId:role.id});
  if(factionId&&!faction&&context)error('role-missing-faction',`Role「${role.name}」の勢力参照が見つかりません。`,'reference',{roleId:role.id,factionId});
  if(faction&&!candidates.some(f=>f.id===faction.id))warn('role-condition',`Role「${role.name}」の割り当てが勢力候補・部屋条件・主体のEncounter候補外です。`,'condition',{roleId:role.id,factionId});
  return {role,candidates,choices,faction};
 });
 if(d)for(const condition of template.factionRelations){const a=bindingMap.get(condition.roleAId),b=bindingMap.get(condition.roleBId);if(a&&b&&!condition.allowedRelations.includes(relation(d,a,b)))warn('faction-relation-condition',`勢力間関係の条件に一致しません（${template.factionRoles.find(r=>r.id===condition.roleAId)!.name} / ${template.factionRoles.find(r=>r.id===condition.roleBId)!.name}）。`);}
 const conditionWarnings=[...warnings];
 const contents=context?.contents??standaloneContents,entries:ResolvedEncounterEntry[]=template.entries.map(entry=>{
  const choices=contents.filter(c=>c.kind===entry.kind&&(entry.source.mode!=='fixed'||c.id===entry.source.contentId)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const policy=entry.source.mode==='fixed'?{mode:'explicit' as const,includeContentIds:[entry.source.contentId],excludeContentIds:[],tags:{allOf:[],anyOf:[],noneOf:[]}}:entry.source.selection;
  const own=resolveContentSelection({...emptyContentSelection(),[entry.kind]:policy},contents);own.warnings.forEach(w=>warn(`selection-${w.code}`,`${entry.label}: ${w.message}`,'material',{entryId:entry.id}));
  const restrictions:ContentDefinition[][]=[],ownCandidates=own.candidates[entry.kind];
  const restrict=(values:ContentDefinition[],layer:'dungeon'|'room'|'faction')=>{
   const before=intersectById(ownCandidates,restrictions);restrictions.push(values);
   if(before.length&&!intersectById(before,[values]).length)diagnostics.push({code:`entry-excluded-${layer}`,severity:'info',category:'condition',message:`${entry.label}: ${layer==='dungeon'?'Dungeon Theme':layer==='room'?'Room Theme':'Faction'}の条件で共通候補がなくなりました。`,context:{roomId:room?.id,entryId:entry.id}});
  };
  if(d?.theme)restrict(resolveContentSelection(d.theme.themeSnapshot.contentSelection,contents).candidates[entry.kind],'dungeon');
  if(room?.roomTheme)restrict(resolveContentSelection(room.roomTheme.themeSnapshot.contentSelection,contents).candidates[entry.kind],'room');
  const faction=entry.factionRoleId?factionRoles.find(r=>r.role.id===entry.factionRoleId)?.faction:undefined;
  if(faction&&['monster','npc'].includes(entry.kind))restrict(resolveFaction(faction.factionSnapshot,contents,[],d?.theme?.themeSnapshot,room?.roomTheme?.themeSnapshot).members[entry.kind as 'monster'|'npc'],'faction');
  const candidates=intersectById(ownCandidates,restrictions);
  if(context&&entry.source.mode==='fixed'&&!choices.length)warn('entry-content-invalid',`${entry.label}: 指定Contentが未解決または種別不一致です。`,'material',{entryId:entry.id});
  if(!candidates.length)warn('entry-empty-candidates',`${entry.label}: 共通Content候補がありません。`,'material',{entryId:entry.id});
  return {entry,candidates,choices};
 });
 return {diagnostics,conditionWarnings,errors:[...new Set(errors)],warnings:[...new Set(warnings)].sort(),factionRoles,entries,applicable:errors.length===0&&warnings.length===0,evaluated:!!context};
}
/** Bounded simultaneous feasibility only; never auto-binds roles for the user. */
export function encounterRoleFeasibility(template:EncounterTemplateDraft,context:EncounterContext,limit:number=ENCOUNTER_LIMITS.searchSteps) {
 limit=Math.max(0,Math.min(ENCOUNTER_LIMITS.searchSteps,Number.isSafeInteger(limit)?limit:ENCOUNTER_LIMITS.searchSteps));
 const roles=resolveEncounter(template,context).factionRoles,chosen=new Map<string,FactionInstance>();let steps=0,incomplete=false;
 const visit=(index:number):boolean=>{
  if(index===roles.length)return true;
  const {role,candidates}=roles[index];
  if(!role.required&&visit(index+1))return true;
  for(const f of candidates){if(++steps>limit){incomplete=true;return false;}if([...chosen.values()].some(v=>v.id===f.id))continue;
   if(template.factionRelations.some(c=>{const otherId=c.roleAId===role.id?c.roleBId:c.roleBId===role.id?c.roleAId:undefined,other=otherId?chosen.get(otherId):undefined;return other&&!c.allowedRelations.includes(relation(context.dungeon,f.id,other.id));}))continue;
   chosen.set(role.id,f);if(visit(index+1))return true;chosen.delete(role.id);
  }return false;
 };
 const possible=visit(0);return {status:possible?'possible' as const:incomplete?'incomplete' as const:'impossible' as const,steps};
}

export function encounterContextSnapshot(context:Pick<EncounterContext,'dungeon'|'roomId'>,template:EncounterTemplateDraft,bindings:readonly FactionRoleBinding[]) {
 const room=context.dungeon.rooms.find(r=>r.id===context.roomId),assignment=context.dungeon.roomFactionAssignments.find(a=>a.roomId===context.roomId),map=new Map(bindings.map(b=>[b.roleId,b.factionId]));
 return {roomThemeRevision:room?.roomTheme?JSON.stringify([room.roomTheme.sourceThemeId,room.roomTheme.themeSnapshot.updatedAt]):'',controlRevision:JSON.stringify([assignment?.status??'unclaimed',assignment?.controllingFactionId??null,[...assignment?.contestingFactionIds??[]].sort()]),relationsRevision:JSON.stringify(template.factionRelations.map(r=>{const a=map.get(r.roleAId),b=map.get(r.roleBId);return [r.roleAId,r.roleBId,a??null,b??null,a&&b?relation(context.dungeon,a,b):'unbound'];}))};
}
