import type {DungeonDocument} from '../types';
import type {ContentDefinition} from '../content';
import type {FactionInstance} from '../factionState';
import {resolveContentSelection,resolveEncounterSelection,resolveFactionSelection,resolveDungeonThemeSelection,resolveRoomThemeSelection,emptyContentSelection} from '../themeSelection';
import type {EncounterTemplateDraft,EncounterContentEntry} from './template';
import {ENCOUNTER_LIMITS} from './template';
import {resolveFaction} from '../factionResolver';
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
 const errors:string[]=[],warnings:string[]=[],d=context?.dungeon,room=d?.rooms.find(r=>r.id===context?.roomId),bindingMap=new Map(bindings.map(b=>[b.roleId,b.factionId]));
 if(context&&!room)errors.push('対象の部屋がありません。');if(bindingMap.size!==bindings.length||bindings.some(b=>!template.factionRoles.some(r=>r.id===b.roleId)))errors.push('Role Bindingが重複または不正です。');
 const assigned=bindings.flatMap(b=>b.factionId?[b.factionId]:[]);if(new Set(assigned).size!==assigned.length)errors.push('異なるRoleへ同じ勢力は割り当てられません。');
 const control=d?.roomFactionAssignments.find(a=>a.roomId===room?.id),status=control?.status??'unclaimed';
 if(room&&d){
  const a=template.applicability,dt=d.theme?.themeSnapshot,rt=room.roomTheme?.themeSnapshot;
  if(dt?!resolveDungeonThemeSelection(a.dungeonThemeSelection,[dt]).candidates.length:a.dungeonThemeSelection.mode!=='all'||a.dungeonThemeSelection.excludeDungeonThemeIds.length>0||a.dungeonThemeSelection.tags.noneOf.length>0)warnings.push('Dungeon Theme適用条件に一致しません。');
  if(rt?!resolveRoomThemeSelection(a.roomThemeSelection,[rt]).candidates.length:a.roomThemeSelection.mode!=='all'||a.roomThemeSelection.excludeRoomThemeIds.length>0||a.roomThemeSelection.tags.noneOf.length>0)warnings.push('Room Theme適用条件に一致しません。');
  if(dt&&!resolveEncounterSelection(dt.encounterSelection,[template]).candidates.length)warnings.push('Dungeon ThemeのEncounter候補外です。');
  if(rt&&!resolveEncounterSelection(rt.encounterSelection,[template]).candidates.length)warnings.push('Room ThemeのEncounter候補外です。');
  if(a.allowedControlStatuses.length&&!a.allowedControlStatuses.includes(status))warnings.push('部屋の支配状態が適用条件と一致しません。');
  const cells=new Set(room.piece.cells.map(c=>`${c.x},${c.y}`)).size;
  if(a.minRoomCells!==undefined&&cells<a.minRoomCells||a.maxRoomCells!==undefined&&cells>a.maxRoomCells)warnings.push('部屋の占有セル数が条件範囲外です。');
  const neighbors=connectedRoomCount(context!);if(a.minConnectedRooms!==undefined||a.maxConnectedRooms!==undefined){if(neighbors===undefined)errors.push('接続条件の判定未完了です。正常な経路の情報が必要です。');else if(a.minConnectedRooms!==undefined&&neighbors<a.minConnectedRooms||a.maxConnectedRooms!==undefined&&neighbors>a.maxConnectedRooms)warnings.push('正常な経路で直接接続した部屋数が条件範囲外です。');}
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
  if(context&&role.required&&!factionId)errors.push(`必須Role「${role.name}」を割り当ててください。`);
  if(factionId&&!faction&&context)errors.push(`Role「${role.name}」の勢力参照が見つかりません。`);
  if(faction&&!candidates.some(f=>f.id===faction.id))warnings.push(`Role「${role.name}」の割り当てが勢力候補・部屋条件・主体のEncounter候補外です。`);
  return {role,candidates,choices,faction};
 });
 if(d)for(const condition of template.factionRelations){const a=bindingMap.get(condition.roleAId),b=bindingMap.get(condition.roleBId);if(a&&b&&!condition.allowedRelations.includes(relation(d,a,b)))warnings.push(`勢力間関係の条件に一致しません（${template.factionRoles.find(r=>r.id===condition.roleAId)!.name} / ${template.factionRoles.find(r=>r.id===condition.roleBId)!.name}）。`);}
 const conditionWarnings=[...warnings];
 const contents=context?.contents??standaloneContents,entries:ResolvedEncounterEntry[]=template.entries.map(entry=>{
  const choices=contents.filter(c=>c.kind===entry.kind&&(entry.source.mode!=='fixed'||c.id===entry.source.contentId)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const policy=entry.source.mode==='fixed'?{mode:'explicit' as const,includeContentIds:[entry.source.contentId],excludeContentIds:[],tags:{allOf:[],anyOf:[],noneOf:[]}}:entry.source.selection;
  const own=resolveContentSelection({...emptyContentSelection(),[entry.kind]:policy},contents);warnings.push(...own.warnings.map(w=>`${entry.label}: ${w.message}`));
  const restrictions=[d?.theme?.themeSnapshot,room?.roomTheme?.themeSnapshot].filter(t=>!!t).map(t=>resolveContentSelection(t.contentSelection,contents).candidates[entry.kind]);
  const faction=entry.factionRoleId?factionRoles.find(r=>r.role.id===entry.factionRoleId)?.faction:undefined;
  if(faction&&['monster','npc'].includes(entry.kind))restrictions.push(resolveFaction(faction.factionSnapshot,contents,[],d?.theme?.themeSnapshot,room?.roomTheme?.themeSnapshot).members[entry.kind as 'monster'|'npc']);
  const candidates=own.candidates[entry.kind].filter(c=>restrictions.every(values=>values.some(v=>v.id===c.id)));
  if(context&&entry.source.mode==='fixed'&&!choices.length)warnings.push(`${entry.label}: 指定Contentが未解決または種別不一致です。`);
  if(!candidates.length)warnings.push(`${entry.label}: 共通Content候補がありません。`);
  return {entry,candidates,choices};
 });
 return {conditionWarnings,errors:[...new Set(errors)],warnings:[...new Set(warnings)].sort(),factionRoles,entries,applicable:errors.length===0&&warnings.length===0,evaluated:!!context};
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
