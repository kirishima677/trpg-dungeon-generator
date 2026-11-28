import type {DungeonDocument} from '../../src/model/types';
import {normalizeDungeonDocument} from '../../src/model/normalizeDungeon';
import {createEntityInstance} from '../../src/model/entity';
import {createEncounterInstance} from '../../src/model/encounter/application';
import {encounterContextFixture,encounterPlanFixture,encounterTemplateFixture} from './encounterFixture';
import {contentFixture} from './entityFixture';
import {themeFixture} from './themeFixture';
import {roomThemeFixture} from './roomThemeFixture';
import {createThemeAssignment} from '../../src/model/dungeonTheme';
import {createRoomThemeAssignment} from '../../src/model/roomTheme';

/** Fixed, bounded layouts for repeatable profiling; no random layout generation. */
export function auditDataset(roomCount:number,entityCount:number,encounterCount:number) {
 const ctx=encounterContextFixture(),source=ctx.dungeon;
 const theme=themeFixture();theme.pieceSelection.mode='all';theme.roomThemeSelection.mode='all';theme.factionSelection.mode='all';theme.encounterSelection.mode='all';
 for(const p of Object.values(theme.contentSelection))p.mode='all';
 const roomTheme=roomThemeFixture();roomTheme.encounterSelection.mode='all';
 const rooms=Array.from({length:roomCount},(_,i)=>({...structuredClone(source.rooms[0]),id:`audit-room-${i}`,position:{x:(i%10)*10,y:Math.floor(i/10)*10},roomTheme:createRoomThemeAssignment(roomTheme),information:{...source.rooms[0].information,number:String(i+1).padStart(2,'0')}}));
 const dungeon:DungeonDocument={...source,theme:createThemeAssignment(theme),rooms,connections:[],entities:[],encounters:[],roomFactionAssignments:rooms.map(r=>({...source.roomFactionAssignments[0],roomId:r.id}))};
 for(let i=0;i<rooms.length-1;i++)if(i%10!==9)dungeon.connections.push({id:`audit-link-${i}`,type:'corridor',fromRoomId:rooms[i].id,toRoomId:rooms[i+1].id,fromConnectorId:rooms[i].piece.connectors.find(c=>c.direction==='east')!.id,toConnectorId:rooms[i+1].piece.connectors.find(c=>c.direction==='west')!.id});
 const plan=encounterPlanFixture(ctx);
 for(let i=0;i<encounterCount;i++){
  const generated=createEncounterInstance({...plan,roomId:rooms[i%rooms.length].id});const encounter={...generated.encounter,id:`audit-encounter-${i}`};
  dungeon.encounters.push(encounter);dungeon.entities.push(...generated.entities.map((e,j)=>({...e,id:`audit-member-${i}-${j}`,origin:{type:'encounter' as const,encounterInstanceId:encounter.id,entryId:plan.entries[j].entryId}})));
 }
 while(dungeon.entities.length<entityCount){const i=dungeon.entities.length;dungeon.entities.push({...createEntityInstance(rooms[i%rooms.length].id,contentFixture('object'),rooms),id:`audit-entity-${i}`});}
 return {dungeon:normalizeDungeonDocument(dungeon),contents:[...ctx.contents,contentFixture('object')],pieces:[rooms[0].piece],theme,roomTheme,template:encounterTemplateFixture()};
}
