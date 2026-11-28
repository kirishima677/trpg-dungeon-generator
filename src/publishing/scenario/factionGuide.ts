import type {DungeonDocument} from '../../model/types';
import {factionDisplayName,RELATION_LABELS,normalizeFactionState} from '../../model/factionState';
import {factionStatistics} from '../../model/factionResolver';
export interface GuideFaction {publicName?:string;publicDescription?:string;name?:string;description?:string; background?:string; objectives?:string;behavior?:string;currentObjectives?:string;currentSituation?:string;gmNotes?:string;definitionGmNotes?:string;territories?:string[];relations?:string[];statistics?:string}
export interface GuideRoomFaction {status:string;currentUse?:string;gmNotes?:string}
export function buildFactionGuides(source:DungeonDocument,gm:boolean,includeGmNotes:boolean,text:(v:string)=>string) {
  const state=normalizeFactionState(source,source.rooms,source.entities??[]),document={...source,...state};
  const byRoom=new Map<string,GuideRoomFaction>();
  const name=(id:string)=>factionDisplayName(state.factions.find(f=>f.id===id)!);
  if(gm)for(const a of state.roomFactionAssignments)byRoom.set(a.roomId,{status:text(a.status==='controlled'?`単独支配: ${name(a.controllingFactionId!)}`:a.status==='contested'?`係争中: ${a.contestingFactionIds.map(name).join(' / ')}`:'無所属'),...(a.currentUse.trim()?{currentUse:text(a.currentUse)}:{}),...(includeGmNotes&&a.gmNotes.trim()?{gmNotes:text(a.gmNotes)}:{})});
  if(gm&&state.factions.length)for(const room of source.rooms)if(!byRoom.has(room.id))byRoom.set(room.id,{status:'無所属'});
  const factions:GuideFaction[]=state.factions.flatMap<GuideFaction>(f=>{
    if(!gm)return f.visibility==='public'&&(f.publicName.trim()||f.publicDescription.trim())?[{...(f.publicName.trim()?{publicName:text(f.publicName)}:{}),...(f.publicDescription.trim()?{publicDescription:text(f.publicDescription)}:{})}]:[];
    const s=f.factionSnapshot,stats=factionStatistics(document,f.id);
    const territories=state.roomFactionAssignments.filter(a=>a.controllingFactionId===f.id||a.contestingFactionIds.includes(f.id)).map(a=>text(`部屋${source.rooms.find(r=>r.id===a.roomId)!.information.number}: ${a.status==='controlled'?'単独支配':'係争中'}`));
    const relations=state.factionRelations.filter(r=>r.factionAId===f.id||r.factionBId===f.id).map(r=>text(`${name(r.factionAId===f.id?r.factionBId:r.factionAId)}: ${RELATION_LABELS[r.kind]}${includeGmNotes&&r.gmNotes.trim()?` / ${r.gmNotes}`:''}`));
    return [{name:text(factionDisplayName(f)),...(s.description.trim()?{background:text(s.description)}:{}),...(s.objectives.trim()?{objectives:text(s.objectives)}:{}),...(s.behavior.trim()?{behavior:text(s.behavior)}:{}),
      ...(f.currentObjectives.trim()?{currentObjectives:text(f.currentObjectives)}:{}),...(f.currentSituation.trim()?{currentSituation:text(f.currentSituation)}:{}),
      ...(includeGmNotes&&s.gmNotes.trim()?{definitionGmNotes:text(s.gmNotes)}:{}),...(includeGmNotes&&f.gmNotes.trim()?{gmNotes:text(f.gmNotes)}:{}),
      territories,relations,statistics:text(`単独支配 ${stats.controlled}部屋 / 係争 ${stats.contested}部屋 / Monster ${stats.monster.groups}組・${stats.monster.quantity}体 / NPC ${stats.npc.groups}組・${stats.npc.quantity}人`)}];
  });
  return {factions,byRoom};
}
