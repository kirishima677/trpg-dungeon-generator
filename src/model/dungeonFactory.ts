import {v4 as uuid} from 'uuid';
import type {Connection, ConnectionType, ConnectorEndpoint, DungeonDocument, Piece, PlacedRoom, Rotation, RoomInformation} from './types';
import {SCHEMA_VERSION} from './dungeonSchema';
import {normalizeRoomInformation, nextRoomNumber, roomInformationError} from './roomInformation';
import {pieceErrors} from '../editor/pieces/pieceDefinition';
import {canConnect} from './connections';

/** Defaults are editor metadata. Callers can supply fixed identity/time without any Store. */
export function createDungeonDocument({id=uuid(),name='新しいダンジョン',createdAt=new Date().toISOString()}: {id?:string;name?:string;createdAt?:string} = {}): DungeonDocument {
 return {id,name,version:SCHEMA_VERSION,rooms:[],connections:[],entities:[],factions:[],factionRelations:[],roomFactionAssignments:[],encounters:[],markdown:'',meta:{gridSize:40},createdAt,updatedAt:createdAt};
}

/** A placement Snapshot, independent of both the Piece Library and the input position. */
export function createPlacedRoom(piece:Piece,position:{x:number;y:number},rooms:readonly PlacedRoom[]=[],rotation:Rotation=0,id=uuid(),information?:RoomInformation): PlacedRoom {
 const errors=pieceErrors(piece);
 if(errors.length)throw new Error(errors.join(' '));
 if(!id.trim()||rooms.some(r=>r.id===id)||![0,90,180,270].includes(rotation)||!Number.isFinite(position.x)||!Number.isFinite(position.y))throw new Error('部屋ID・位置・回転が不正です。');
 const info=normalizeRoomInformation(information,information?.number?.trim()||nextRoomNumber(rooms.map(r=>r.information.number)));
 const error=roomInformationError(info,rooms.map(r=>r.information.number));if(error)throw new Error(error);
 return {id,pieceId:piece.id,piece:structuredClone(piece),position:{...position},rotation,information:info};
}

export function createConnection(rooms:PlacedRoom[],connections:Connection[],from:ConnectorEndpoint,to:ConnectorEndpoint,type:ConnectionType='corridor',id=uuid()): Connection {
 if(!id.trim()||connections.some(c=>c.id===id)||!['corridor','door','stairs','secret'].includes(type)||!canConnect(rooms,connections,from,to))throw new Error('接続のID・端点・種類が不正です。');
 return {id,fromRoomId:from.roomId,fromConnectorId:from.connectorId,toRoomId:to.roomId,toConnectorId:to.connectorId,type};
}
