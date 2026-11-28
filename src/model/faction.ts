import { v4 as uuid } from 'uuid';
import { checkThemeSize, normalizeThemeMetadata, THEME_LIMITS, themeDate, themeText } from './dungeonTheme';
import { emptyContentSelection, emptyRoomThemeSelection, normalizeKindSelection, normalizeRoomThemeSelection, selectionRecord } from './themeSelection';
import type { ContentSelectionPolicy, RoomThemeSelectionPolicy } from './themeSelection';

export interface FactionDefinition {
  id:string; name:string; genre:string; category:string; summary:string; description:string; objectives:string; behavior:string; gmNotes:string; tags:string[];
  memberSelection:Pick<ContentSelectionPolicy,'monster'|'npc'>; roomThemeSelection:RoomThemeSelectionPolicy; createdAt:string; updatedAt:string;
}
export type FactionDraft = Omit<FactionDefinition,'createdAt'|'updatedAt'>;
export const FACTION_LIMITS = {...THEME_LIMITS, instances:50, relations:1225, assignments:1000, contesting:10, localMarkdown:20_000, stateBytes:8*1024*1024} as const;
export function normalizeFactionDraft(value:unknown):FactionDraft {
  const raw=selectionRecord(value), members=selectionRecord(raw.memberSelection);
  if(Object.keys(members).length!==2 || Object.keys(members).some(k=>k!=='monster'&&k!=='npc')) throw new Error('勢力構成候補はMonsterとNPCの2種別で指定してください。');
  const faction={...normalizeThemeMetadata(value),objectives:themeText(raw.objectives,'目的',FACTION_LIMITS.markdown),behavior:themeText(raw.behavior,'行動方針',FACTION_LIMITS.markdown),
    memberSelection:{monster:normalizeKindSelection(members.monster),npc:normalizeKindSelection(members.npc)},roomThemeSelection:normalizeRoomThemeSelection(raw.roomThemeSelection)};
  checkThemeSize(faction);return faction;
}
export function normalizeFaction(value:unknown):FactionDefinition {
  const raw=selectionRecord(value),createdAt=themeDate(raw.createdAt),updatedAt=themeDate(raw.updatedAt);
  if(updatedAt<createdAt)throw new Error('更新日時は作成日時以降で指定してください。');
  const result={...normalizeFactionDraft(value),createdAt,updatedAt};checkThemeSize(result);return result;
}
export function newFaction():FactionDraft {
  const {monster,npc}=emptyContentSelection();return {id:uuid(),name:'',genre:'',category:'',summary:'',description:'',objectives:'',behavior:'',gmNotes:'',tags:[],memberSelection:{monster,npc},roomThemeSelection:emptyRoomThemeSelection()};
}
export const duplicateFaction=(value:FactionDraft):FactionDraft=>({...normalizeFactionDraft(value),id:uuid(),name:value.name.length+4<=FACTION_LIMITS.name?`${value.name}（複製）`:value.name});
export function sameFaction(a:FactionDefinition,b:FactionDefinition) {
  const canonical=(v:FactionDefinition)=>JSON.stringify(normalizeFactionDraft(v),(_,x)=>Array.isArray(x)?[...x].sort():x);return canonical(a)===canonical(b);
}
