import {v4 as uuid} from 'uuid';
import {normalizeThemeMetadata,themeText,themeDate,checkThemeSize,THEME_LIMITS} from '../dungeonTheme';
import {CONTENT_KINDS} from '../content';
import type {ContentKind} from '../content';
import {ENTITY_LIMITS,normalizeEntityEdits} from '../entity';
import type {EntityVisibility} from '../entity';
import {RELATION_KINDS} from '../factionState';
import type {FactionRelation} from '../factionState';
import {emptyDungeonThemeSelection,emptyRoomThemeSelection,emptyFactionSelection,normalizeDungeonThemeSelection,normalizeRoomThemeSelection,normalizeFactionSelection,normalizeKindSelection,selectionRecord} from '../themeSelection';
import type {DungeonThemeSelectionPolicy,RoomThemeSelectionPolicy,FactionSelectionPolicy,ContentKindSelection} from '../themeSelection';
export const ENCOUNTER_LIMITS={...THEME_LIMITS,roles:8,entries:50,relationConditions:28,perRoom:20,total:200,stateBytes:8*1024*1024,searchSteps:2000,warnings:100} as const;
export const CONTROL_STATUSES=['unclaimed','controlled','contested'] as const;
export const BINDING_TYPES=['room-controller','room-contender','any-faction'] as const;
export interface EncounterApplicability {
 dungeonThemeSelection:DungeonThemeSelectionPolicy;roomThemeSelection:RoomThemeSelectionPolicy;allowedControlStatuses:typeof CONTROL_STATUSES[number][];
 minRoomCells?:number;maxRoomCells?:number;minConnectedRooms?:number;maxConnectedRooms?:number;
}
export interface EncounterFactionRole {id:string;name:string;required:boolean;bindingType:typeof BINDING_TYPES[number];factionSelection:FactionSelectionPolicy}
export interface EncounterFactionRelationCondition {roleAId:string;roleBId:string;allowedRelations:FactionRelation['kind'][]}
export type EncounterContentSource={mode:'fixed';contentId:string}|{mode:'selection';selection:ContentKindSelection};
export interface EncounterContentEntry {
 id:string;label:string;kind:ContentKind;source:EncounterContentSource;required:boolean;quantity:{min:number;max:number};factionRoleId?:string;
 customName:string;publicDescription:string;gmNotes:string;visibility:EntityVisibility;
}
export interface EncounterTemplate {
 id:string;name:string;genre:string;category:string;summary:string;description:string;situation:string;objectives:string;gmNotes:string;publicDescription:string;tags:string[];
 applicability:EncounterApplicability;factionRoles:EncounterFactionRole[];factionRelations:EncounterFactionRelationCondition[];primaryFactionRoleId?:string;entries:EncounterContentEntry[];createdAt:string;updatedAt:string;
}
export type EncounterTemplateDraft=Omit<EncounterTemplate,'createdAt'|'updatedAt'>;
export const encounterId=(value:unknown)=>themeText(value,'Encounter参照ID',128,true);
export function encounterArray(value:unknown,max:number):unknown[] {if(!Array.isArray(value)||value.length>max)throw new Error(`Encounter配列は${max}件以内で指定してください。`);return value;}
function bool(value:unknown):boolean {if(typeof value!=='boolean')throw new Error('必須指定は真偽値で指定してください。');return value;}
export function normalizeApplicability(value:unknown):EncounterApplicability {
 const r=selectionRecord(value),result:EncounterApplicability={dungeonThemeSelection:normalizeDungeonThemeSelection(r.dungeonThemeSelection),roomThemeSelection:normalizeRoomThemeSelection(r.roomThemeSelection),allowedControlStatuses:[]};
 const statuses=encounterArray(r.allowedControlStatuses,3);if(statuses.some(v=>!CONTROL_STATUSES.includes(v as typeof CONTROL_STATUSES[number])))throw new Error('支配状態の条件が不正です。');result.allowedControlStatuses=[...new Set(statuses)] as EncounterApplicability['allowedControlStatuses'];
 for(const field of ['minRoomCells','maxRoomCells','minConnectedRooms','maxConnectedRooms'] as const)if(r[field]!==undefined){const min=field.endsWith('RoomCells')?1:0;if(!Number.isSafeInteger(r[field])||(r[field] as number)<min||(r[field] as number)>1_000_000)throw new Error(`${field}は${min}〜1000000の整数で指定してください。`);result[field]=r[field] as number;}
 for(const [min,max]of [['minRoomCells','maxRoomCells'],['minConnectedRooms','maxConnectedRooms']] as const)if(result[min]!==undefined&&result[max]!==undefined&&result[min]!>result[max]!)throw new Error('適用条件の最小値は最大値以下にしてください。');return result;
}
export function normalizeEncounterDraft(value:unknown):EncounterTemplateDraft {
 const r=selectionRecord(value),roles=encounterArray(r.factionRoles,ENCOUNTER_LIMITS.roles).map(value=>{const v=selectionRecord(value);if(!BINDING_TYPES.includes(v.bindingType as EncounterFactionRole['bindingType']))throw new Error('勢力役割の割り当て種別が不正です。');return {id:encounterId(v.id),name:themeText(v.name,'役割名',200,true),required:bool(v.required),bindingType:v.bindingType as EncounterFactionRole['bindingType'],factionSelection:normalizeFactionSelection(v.factionSelection)};});
 const byRole=new Map(roles.map(role=>[role.id,role]));if(byRole.size!==roles.length)throw new Error('Role IDが重複しています。');
 const primaryFactionRoleId=r.primaryFactionRoleId===undefined?undefined:encounterId(r.primaryFactionRoleId);if(primaryFactionRoleId&&!byRole.get(primaryFactionRoleId)?.required)throw new Error('主体Factionには必須Roleを指定してください。');
 const pairs=new Set<string>();const factionRelations=encounterArray(r.factionRelations,ENCOUNTER_LIMITS.relationConditions).map(value=>{const v=selectionRecord(value),[roleAId,roleBId]=[encounterId(v.roleAId),encounterId(v.roleBId)].sort(),pair=JSON.stringify([roleAId,roleBId]);if(roleAId===roleBId||!byRole.get(roleAId)?.required||!byRole.get(roleBId)?.required||pairs.has(pair))throw new Error('勢力間条件には異なる必須Roleの重複しない組を指定してください。');pairs.add(pair);const allowed=encounterArray(v.allowedRelations,6);if(!allowed.length||allowed.some(k=>!RELATION_KINDS.includes(k as FactionRelation['kind'])))throw new Error('許容する勢力関係を1つ以上指定してください。');return {roleAId,roleBId,allowedRelations:[...new Set(allowed)] as FactionRelation['kind'][]};});
 const entries=encounterArray(r.entries,ENCOUNTER_LIMITS.entries).map(value=>{const v=selectionRecord(value),q=selectionRecord(v.quantity),source=selectionRecord(v.source);if(!CONTENT_KINDS.includes(v.kind as ContentKind))throw new Error('EntryのContentKindが不正です。');if(![q.min,q.max].every(n=>Number.isSafeInteger(n)&&(n as number)>=1&&(n as number)<=ENTITY_LIMITS.quantity)||(q.min as number)>(q.max as number))throw new Error('数量範囲は1〜1000000の整数で、最小≤最大にしてください。');
  let contentSource:EncounterContentSource;if(source.mode==='fixed')contentSource={mode:'fixed',contentId:encounterId(source.contentId)};else if(source.mode==='selection')contentSource={mode:'selection',selection:normalizeKindSelection(source.selection)};else throw new Error('素材指定の種別が不正です。');
  const required=bool(v.required),factionRoleId=v.factionRoleId===undefined?undefined:encounterId(v.factionRoleId);if(factionRoleId&&(!['monster','npc'].includes(v.kind as string)||!byRole.has(factionRoleId)||required&&!byRole.get(factionRoleId)!.required))throw new Error('Entryの勢力Role参照が不正です。必須Entryには必須Roleが必要です。');
  const {quantity:_quantity,...edits}=normalizeEntityEdits({...v,quantity:q.min});return {id:encounterId(v.id),label:themeText(v.label,'構成要素名',200,true),kind:v.kind as ContentKind,source:contentSource,required,quantity:{min:q.min as number,max:q.max as number},...(factionRoleId?{factionRoleId}:{}),...edits};
 });if(new Set(entries.map(e=>e.id)).size!==entries.length)throw new Error('Entry IDが重複しています。');
 const result={...normalizeThemeMetadata(value),applicability:normalizeApplicability(r.applicability),factionRoles:roles,factionRelations,...(primaryFactionRoleId?{primaryFactionRoleId}:{}),entries,situation:themeText(r.situation,'状況',THEME_LIMITS.markdown),objectives:themeText(r.objectives,'目的',THEME_LIMITS.markdown),publicDescription:themeText(r.publicDescription,'公開説明',ENTITY_LIMITS.markdown)};checkThemeSize(result);return result;
}
export function normalizeEncounterTemplate(value:unknown):EncounterTemplate {const r=selectionRecord(value),createdAt=themeDate(r.createdAt),updatedAt=themeDate(r.updatedAt);if(updatedAt<createdAt)throw new Error('更新日時が作成日時より前です。');const result={...normalizeEncounterDraft(value),createdAt,updatedAt};checkThemeSize(result);return result;}
export function newEncounterTemplate():EncounterTemplateDraft {return {id:uuid(),name:'',genre:'',category:'',summary:'',description:'',situation:'',objectives:'',gmNotes:'',publicDescription:'',tags:[],applicability:{dungeonThemeSelection:emptyDungeonThemeSelection(),roomThemeSelection:emptyRoomThemeSelection('all'),allowedControlStatuses:[]},factionRoles:[],factionRelations:[],entries:[]};}
export const newEncounterRole=():EncounterFactionRole=>({id:uuid(),name:'新しい役割',required:true,bindingType:'any-faction',factionSelection:emptyFactionSelection('all')});
export const newEncounterEntry=():EncounterContentEntry=>({id:uuid(),label:'新しい構成要素',kind:'monster',source:{mode:'selection',selection:{mode:'all',includeContentIds:[],excludeContentIds:[],tags:{allOf:[],anyOf:[],noneOf:[]}}},required:true,quantity:{min:1,max:1},customName:'',publicDescription:'',gmNotes:'',visibility:'gm-only'});
export function duplicateEncounterTemplate(value:EncounterTemplateDraft):EncounterTemplateDraft {const d=normalizeEncounterDraft(value),ids=new Map(d.factionRoles.map(r=>[r.id,uuid()]));return {...d,id:uuid(),name:d.name.length+4<=200?`${d.name}（複製）`:d.name,factionRoles:d.factionRoles.map(r=>({...r,id:ids.get(r.id)!})),factionRelations:d.factionRelations.map(r=>({...r,roleAId:ids.get(r.roleAId)!,roleBId:ids.get(r.roleBId)!})),...(d.primaryFactionRoleId?{primaryFactionRoleId:ids.get(d.primaryFactionRoleId)!}:{}),entries:d.entries.map(e=>({...e,id:uuid(),...(e.factionRoleId?{factionRoleId:ids.get(e.factionRoleId)!}:{})}))};}
export function sameEncounterTemplate(a:EncounterTemplate,b:EncounterTemplate) {const key=(t:EncounterTemplate)=>JSON.stringify(normalizeEncounterDraft(t),(_,v)=>Array.isArray(v)&&v.every(x=>typeof x==='string')?[...v].sort():v);return key(a)===key(b);}
