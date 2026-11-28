import {newFaction} from '../../src/model/faction';
import type {FactionDefinition} from '../../src/model/faction';
import {createFactionInstance,emptyRoomFaction} from '../../src/model/factionState';
import {normalizeDungeonDocument} from '../../src/model/normalizeDungeon';
import {createEntityInstance} from '../../src/model/entity';
import {contentFixture,entityDungeon,entityTimestamp} from './entityFixture';
export function factionFixture(id='FACTION_PRIVATE_DEFINITION'):FactionDefinition {
 return {...newFaction(),id,name:'FACTION_PRIVATE_NAME',genre:'fantasy',category:'部族',summary:'地下の部族',description:'## FACTION_PRIVATE_BACKGROUND',objectives:'FACTION_PRIVATE_OBJECTIVES',behavior:'FACTION_PRIVATE_BEHAVIOR',gmNotes:'FACTION_PRIVATE_GM',tags:['地下'],createdAt:entityTimestamp,updatedAt:entityTimestamp};
}
export function factionDungeon() {
 const d=normalizeDungeonDocument(entityDungeon());d.factions=['A','B','C'].map((id,i)=>({...createFactionInstance(factionFixture(),i),id:`FACTION_PRIVATE_INSTANCE_${id}`,customName:`FACTION_PRIVATE_${id}`,currentObjectives:'FACTION_PRIVATE_CURRENT',currentSituation:'FACTION_PRIVATE_SITUATION',gmNotes:'FACTION_PRIVATE_INSTANCE_GM'}));
 d.factionRelations=[{id:'FACTION_PRIVATE_RELATION',factionAId:d.factions[0].id,factionBId:d.factions[1].id,kind:'hostile',gmNotes:'FACTION_PRIVATE_RELATION_GM'}];
 d.roomFactionAssignments=[{...emptyRoomFaction(d.rooms[0].id),status:'controlled',controllingFactionId:d.factions[0].id,currentUse:'FACTION_PRIVATE_USE',gmNotes:'FACTION_PRIVATE_TERRITORY_GM'}, {...emptyRoomFaction(d.rooms[1].id),status:'contested',contestingFactionIds:d.factions.map(f=>f.id)}];
 d.entities=[{...createEntityInstance(d.rooms[0].id,contentFixture(),d.rooms,4),factionId:d.factions[0].id},{...createEntityInstance(d.rooms[0].id,contentFixture('npc'),d.rooms,2),factionId:d.factions[1].id}];return d;
}
