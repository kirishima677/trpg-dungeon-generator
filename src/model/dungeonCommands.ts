import {v4 as uuid} from 'uuid';
import type {DungeonDocument} from './types';
import {nextRoomNumber} from './roomInformation';
import {pieceBounds} from '../utils/geometry';
import {detectCollision} from '../editor/collision/collisionDetection';
import {checkEntityLimits} from './entity';
import {normalizeEncounters} from './encounter/state';
import {normalizeFactionState} from './factionState';

/** Complete changes only; UI selection, timestamps, persistence and history belong to callers. */
export function duplicateRoomDocument(dungeon:DungeonDocument,roomId:string): {document:DungeonDocument;roomId:string} {
 const source=dungeon.rooms.find(r=>r.id===roomId);if(!source)throw new Error('部屋が見つかりません。');
 const room=structuredClone(source);room.id=uuid();room.information.number=nextRoomNumber(dungeon.rooms.map(r=>r.information.number));
 const {w,h}=pieceBounds(room.piece,room.rotation);let found=false;
 for(let i=1;i<=512;i++){
  room.position={x:source.position.x+(i%16)*(w+1),y:source.position.y+Math.floor(i/16)*(h+1)};
  if(!detectCollision(room,dungeon.rooms)){found=true;break;}
 }
 if(!found)throw new Error('複製先の空き領域が見つかりません。');
 const encounterIds=new Map(dungeon.encounters.filter(e=>e.roomId===roomId).map(e=>[e.id,uuid()]));
 const encounters=[...dungeon.encounters,...dungeon.encounters.filter(e=>e.roomId===roomId).map(e=>({...structuredClone(e),id:encounterIds.get(e.id)!,roomId:room.id}))];
 const entities=[...dungeon.entities,...dungeon.entities.filter(e=>e.roomId===roomId).map(e=>({...structuredClone(e),id:uuid(),roomId:room.id,...(e.origin?.type==='encounter'?{origin:{...e.origin,encounterInstanceId:encounterIds.get(e.origin.encounterInstanceId)!}}:{})}))];
 const rooms=[...dungeon.rooms,room];
 const roomFactionAssignments=[...dungeon.roomFactionAssignments,...dungeon.roomFactionAssignments.filter(a=>a.roomId===roomId).map(a=>({...structuredClone(a),roomId:room.id}))];
 checkEntityLimits(entities);normalizeEncounters(encounters,rooms,dungeon.factions,entities);
 normalizeFactionState({...dungeon,roomFactionAssignments},rooms,entities);
 return {document:{...dungeon,rooms,entities,encounters,roomFactionAssignments},roomId:room.id};
}

export function deleteRoomDocument(dungeon:DungeonDocument,id:string): DungeonDocument|null {
 if(!dungeon.rooms.some(r=>r.id===id))return null;
 return {...dungeon,rooms:dungeon.rooms.filter(r=>r.id!==id),connections:dungeon.connections.filter(c=>c.fromRoomId!==id&&c.toRoomId!==id),entities:dungeon.entities.filter(e=>e.roomId!==id),encounters:dungeon.encounters.filter(e=>e.roomId!==id),roomFactionAssignments:dungeon.roomFactionAssignments.filter(a=>a.roomId!==id)};
}

export function deleteEncounterDocument(dungeon:DungeonDocument,id:string,withEntities:boolean): DungeonDocument {
 if(!dungeon.encounters.some(e=>e.id===id))throw new Error('Encounterがありません。');
 const encounters=dungeon.encounters.filter(e=>e.id!==id),entities=dungeon.entities.flatMap(e=>{
  if(e.origin?.type!=='encounter'||e.origin.encounterInstanceId!==id)return [e];if(withEntities)return [];
  const {origin:_origin,...rest}=e;return [rest];
 });
 return {...dungeon,encounters,entities};
}
