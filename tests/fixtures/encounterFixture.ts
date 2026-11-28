import {newEncounterTemplate,newEncounterRole,newEncounterEntry} from '../../src/model/encounter/template';
import type {EncounterTemplate} from '../../src/model/encounter/template';
import {factionDungeon} from './factionFixture';
import {contentFixture,entityTimestamp} from './entityFixture';
import {emptyEncounterSelection} from '../../src/model/themeSelection';
import {createConnectionSceneResolver} from '../../src/editor/connectors/corridor/connectionScene';
import {prepareEncounterPlan} from '../../src/model/encounter/application';
export function encounterTemplateFixture():EncounterTemplate {
 const guard={...newEncounterRole(),id:'role-guard',name:'看守側',bindingType:'room-controller' as const},prisoner={...newEncounterRole(),id:'role-prisoner',name:'捕虜側'};
 const entry=(id:string,label:string,kind:'monster'|'npc'|'event',role?:string)=>({...newEncounterEntry(),id,label,kind,source:{mode:'fixed' as const,contentId:contentFixture(kind).id},...(role?{factionRoleId:role}:{}),quantity:{min:kind==='monster'?2:1,max:kind==='monster'?4:1},required:kind!=='event'});
 return {...newEncounterTemplate(),id:'ENCOUNTER_PRIVATE_SOURCE',name:'ENCOUNTER_PRIVATE_NAME',category:'捕虜の監視',genre:'fantasy',description:'## ENCOUNTER_PRIVATE_BACKGROUND',situation:'ENCOUNTER_PRIVATE_SITUATION',objectives:'ENCOUNTER_PRIVATE_OBJECTIVES',gmNotes:'ENCOUNTER_PRIVATE_GM',publicDescription:'牢の奥から**鎖の音**が聞こえる。',factionRoles:[guard,prisoner],primaryFactionRoleId:guard.id,factionRelations:[{roleAId:guard.id,roleBId:prisoner.id,allowedRelations:['hostile']}],entries:[entry('entry-guard','看守','monster',guard.id),entry('entry-prisoner','捕虜','npc',prisoner.id),entry('entry-alarm','警報','event')],createdAt:entityTimestamp,updatedAt:entityTimestamp};
}
export function encounterContextFixture(){
 const dungeon=factionDungeon();for(const f of dungeon.factions){f.factionSnapshot.encounterSelection=emptyEncounterSelection('all');f.factionSnapshot.memberSelection.monster.mode='all';f.factionSnapshot.memberSelection.npc.mode='all';}
 const scene=createConnectionSceneResolver()(dungeon.rooms,dungeon.connections);
 return {dungeon,roomId:dungeon.rooms[0].id,contents:[contentFixture(),contentFixture('npc'),contentFixture('event')],successfulConnectionIds:new Set(scene.drawings.filter(d=>d.result.status==='success').map(d=>d.connection.id))};
}
export function encounterChoices(t=encounterTemplateFixture()){return t.entries.map(e=>({entryId:e.id,included:e.required,contentId:e.source.mode==='fixed'?e.source.contentId:undefined,quantity:e.quantity.min}));}
export function encounterBindings(ctx=encounterContextFixture()){return [{roleId:'role-guard',factionId:ctx.dungeon.factions[0].id},{roleId:'role-prisoner',factionId:ctx.dungeon.factions[1].id}];}
export function encounterPlanFixture(ctx=encounterContextFixture(),t=encounterTemplateFixture()){return prepareEncounterPlan(t,ctx,encounterBindings(ctx),encounterChoices(t));}
