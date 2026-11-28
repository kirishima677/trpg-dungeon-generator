import type {DungeonDocument} from '../../model/types';
import {normalizeEncounters,encounterDisplayName,encounterDiagnostics} from '../../model/encounter/state';
import {normalizeEntities} from '../../model/entity';
import {factionDisplayName} from '../../model/factionState';
import {buildEntityGuides} from './entityGuide';
import type {RoomEntityGuide} from './entityGuide';
import type {ScenarioGuideOptions} from './scenarioGuide';
export interface GuideEncounter extends RoomEntityGuide {name:string;situation?:string;objectives?:string;background?:string;gmNotes?:string;definitionGmNotes?:string;bindings:{role:string;name:string}[];diagnostics?:string[]}
export interface RoomEncounterGuide {encounters?:GuideEncounter[];encounterDescriptions?:string[]}
/** Player descriptions are extracted independently of Entity public descriptions and contain no association. */
export function buildEncounterGuides(source:DungeonDocument,gm:boolean,options:ScenarioGuideOptions,text:(v:string)=>string) {
 const entities=normalizeEntities(source.entities,source.rooms),encounters=normalizeEncounters(source.encounters,source.rooms,source.factions??[],entities),byRoom=new Map<string,RoomEncounterGuide>();
 for(const room of source.rooms){const values=encounters.filter(e=>e.roomId===room.id);if(!gm){const descriptions=options.includeRoomDescriptions?values.filter(e=>e.visibility==='public'&&e.publicDescription.trim()).map(e=>text(e.publicDescription)):[];if(descriptions.length)byRoom.set(room.id,{encounterDescriptions:descriptions});continue;}
  const projected:GuideEncounter[]=values.map(e=>{
   const members=entities.filter(v=>v.origin?.type==='encounter'&&v.origin.encounterInstanceId===e.id),groups=buildEntityGuides({...source,entities:members},true,options,text).get(room.id);
   return {name:text(encounterDisplayName(e)),bindings:e.factionBindings.map(b=>({role:text(e.encounterSnapshot.factionRoles.find(r=>r.id===b.roleId)!.name),name:text(b.factionId?factionDisplayName(source.factions.find(f=>f.id===b.factionId)!):'未割り当て')})),...groups,
    ...(options.includeRoomDescriptions&&e.encounterSnapshot.description.trim()?{background:text(e.encounterSnapshot.description)}:{}),...(e.situation.trim()?{situation:text(e.situation)}:{}),...(e.objectives.trim()?{objectives:text(e.objectives)}:{}),
    ...(options.includeGmNotes&&e.gmNotes.trim()?{gmNotes:text(e.gmNotes)}:{}),...(options.includeGmNotes&&e.encounterSnapshot.gmNotes.trim()?{definitionGmNotes:text(e.encounterSnapshot.gmNotes)}:{}),
    diagnostics:[...e.acceptedWarnings,...encounterDiagnostics({...source,entities,encounters},e)].map(text)};
  });if(projected.length)byRoom.set(room.id,{encounters:projected});
 }return byRoom;
}
