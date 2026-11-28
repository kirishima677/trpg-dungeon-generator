import {v4 as uuid} from 'uuid';
import {createEntityInstance,normalizeEntity,checkEntityLimits} from '../entity';
import type {ContentDefinition} from '../content';
import type {DungeonDocument} from '../types';
import type {EncounterTemplate} from './template';
import {normalizeEncounterTemplate,encounterId} from './template';
import {resolveEncounter,encounterContextSnapshot} from './resolver';
import type {EncounterContext,FactionRoleBinding} from './resolver';
import {normalizeEncounters} from './state';
import type {EncounterInstance,EncounterContextSnapshot} from './state';
export interface EncounterEntryChoice {entryId:string;included:boolean;contentId?:string;quantity:number}
export interface EncounterEntryPlan {entryId:string;contentDefinition:ContentDefinition;quantity:number;factionId?:string}
export interface EncounterApplicationPlan {creationContext:EncounterContextSnapshot;roomId:string;templateSnapshot:EncounterTemplate;factionBindings:FactionRoleBinding[];entries:EncounterEntryPlan[];acceptedWarnings:string[];revision:string}
export function encounterRevision(context:EncounterContext,template:EncounterTemplate):string {
 // Covers mutable logical data and library revisions, without any routing work or stored derived geometry.
 const json=JSON.stringify([context.dungeon,template,[...context.contents].sort((a,b)=>a.id<b.id?-1:1),context.successfulConnectionIds?[...context.successfulConnectionIds].sort():null]);
 let hash=0xcbf29ce484222325n;for(let i=0;i<json.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(json.charCodeAt(i)))*0x100000001b3n);return hash.toString(16);
}
export function prepareEncounterPlan(templateValue:EncounterTemplate,context:EncounterContext,bindings:readonly FactionRoleBinding[],choices:readonly EncounterEntryChoice[],acceptWarnings=false):EncounterApplicationPlan {
 const template=normalizeEncounterTemplate(templateValue),result=resolveEncounter(template,context,bindings),errors=[...result.errors],warnings=result.diagnostics.filter(d=>d.severity==='warning'&&d.code!=='entry-empty-candidates'&&d.code!=='selection-empty-candidates').map(d=>d.message),entries:EncounterEntryPlan[]=[];
 if(new Set(choices.map(e=>e.entryId)).size!==choices.length||choices.some(c=>!template.entries.some(e=>e.id===c.entryId)))errors.push('Entry選択のIDが重複または不正です。');
 for(const item of result.entries){const entry=item.entry,choice=choices.find(c=>c.entryId===entry.id);if(!choice?.included){if(entry.required)errors.push(`必須Entry「${entry.label}」を採用してください。`);continue;}
  const content=item.choices.find(c=>c.id===choice.contentId);if(!content){errors.push(`${entry.label}: Contentが未解決または種別不一致です。`);continue;}
  if(!Number.isSafeInteger(choice.quantity)||choice.quantity<entry.quantity.min||choice.quantity>entry.quantity.max){errors.push(`${entry.label}: 数量がテンプレート範囲外です。`);continue;}
  const factionId=entry.factionRoleId?bindings.find(b=>b.roleId===entry.factionRoleId)?.factionId:undefined;if(entry.factionRoleId&&!factionId){errors.push(`${entry.label}: 所属Roleが未解決です。任意Entryは不採用にできます。`);continue;}
  if(!item.candidates.some(c=>c.id===content.id))warnings.push(`${entry.label}: 選択したContentはEntry・Theme・Factionの共通候補外です。`);
  entries.push({entryId:entry.id,contentDefinition:structuredClone(content),quantity:choice.quantity,...(factionId?{factionId}:{})});
 }
 if(errors.length)throw new Error([...new Set(errors)].join(' '));
 const accepted=[...new Set(warnings)].sort();if(accepted.length&&!acceptWarnings)throw new Error(`条件の不一致を確認して例外適用を指定してください。 ${accepted.join(' ')}`);
 const plan={creationContext:encounterContextSnapshot(context,template,bindings),roomId:context.roomId,templateSnapshot:template,factionBindings:template.factionRoles.map(r=>({roleId:r.id,...(bindings.find(b=>b.roleId===r.id)?.factionId?{factionId:bindings.find(b=>b.roleId===r.id)!.factionId}:{})})),entries,acceptedWarnings:accepted,revision:encounterRevision(context,template)};
 const generated=createEncounterInstance(plan);checkEntityLimits([...context.dungeon.entities,...generated.entities]);normalizeEncounters([...context.dungeon.encounters,generated.encounter],context.dungeon.rooms,context.dungeon.factions,[...context.dungeon.entities,...generated.entities]);return plan;
}
/** Pure factory apart from new UUIDs. No repository access and no mutation. */
export function createEncounterInstance(plan:EncounterApplicationPlan) {
 const template=normalizeEncounterTemplate(plan.templateSnapshot),id=uuid();
 const bindingMap=new Map(plan.factionBindings.map(b=>[b.roleId,b.factionId])),bound=plan.factionBindings.flatMap(b=>b.factionId?[b.factionId]:[]);
 if(bindingMap.size!==plan.factionBindings.length||plan.factionBindings.some(b=>!template.factionRoles.some(r=>r.id===b.roleId))||new Set(bound).size!==bound.length||template.factionRoles.some(r=>r.required&&!bindingMap.get(r.id)))throw new Error('Encounter生成PlanのRole Bindingが不正です。');
 const encounter:EncounterInstance={id,roomId:encounterId(plan.roomId),creationContext:structuredClone(plan.creationContext),sourceEncounterId:template.id,encounterSnapshot:template,factionBindings:structuredClone(plan.factionBindings),customName:'',situation:template.situation,objectives:template.objectives,gmNotes:'',visibility:'gm-only',publicDescription:template.publicDescription,acceptedWarnings:[...plan.acceptedWarnings]};
 const seen=new Set<string>();const entities=plan.entries.map(item=>{const entry=template.entries.find(e=>e.id===item.entryId);if(!entry||seen.has(item.entryId)||entry.kind!==item.contentDefinition.kind||entry.source.mode==='fixed'&&entry.source.contentId!==item.contentDefinition.id||(entry.factionRoleId?bindingMap.get(entry.factionRoleId)!==item.factionId||!item.factionId:item.factionId!==undefined)||item.quantity<entry.quantity.min||item.quantity>entry.quantity.max)throw new Error('Encounter生成PlanのEntryが不正です。');seen.add(item.entryId);
 const base=createEntityInstance(plan.roomId,item.contentDefinition,[{id:plan.roomId}],item.quantity);return normalizeEntity({...base,customName:entry.customName,publicDescription:entry.publicDescription,gmNotes:entry.gmNotes,visibility:entry.visibility,...(item.factionId?{factionId:item.factionId}:{}),origin:{type:'encounter',encounterInstanceId:id,entryId:entry.id}},new Set([plan.roomId]));});
 if(template.entries.some(e=>e.required&&!seen.has(e.id)))throw new Error('Encounter生成Planに必須Entryがありません。');return {encounter,entities};
}
export function validateEncounterPlan(plan:EncounterApplicationPlan,context:EncounterContext) {
 if(plan.revision!==encounterRevision(context,plan.templateSnapshot))throw new Error('適用前に状態が変わりました。再プレビューしてください。');
 const checked=prepareEncounterPlan(plan.templateSnapshot,context,plan.factionBindings,plan.templateSnapshot.entries.map(e=>{const p=plan.entries.find(p=>p.entryId===e.id);return {entryId:e.id,included:!!p,contentId:p?.contentDefinition.id,quantity:p?.quantity??e.quantity.min};}),true);
 if(JSON.stringify(checked)!==JSON.stringify(plan))throw new Error('Planの確定内容が一致しません。再プレビューしてください。');
}
export function applyEncounterPlan(dungeon:DungeonDocument,plan:EncounterApplicationPlan,contents:readonly ContentDefinition[],successfulConnectionIds?:ReadonlySet<string>) {
 validateEncounterPlan(plan,{dungeon,roomId:plan.roomId,contents,successfulConnectionIds});const generated=createEncounterInstance(plan),entities=[...dungeon.entities,...generated.entities],encounters=normalizeEncounters([...dungeon.encounters,generated.encounter],dungeon.rooms,dungeon.factions,entities);checkEntityLimits(entities);return {encounters,entities};
}
