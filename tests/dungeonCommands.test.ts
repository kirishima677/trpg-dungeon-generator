import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDungeonDocument,createPlacedRoom,createConnection} from '../src/model/dungeonFactory';
import {duplicateRoomDocument,deleteRoomDocument,deleteEncounterDocument} from '../src/model/dungeonCommands';
import {assertDungeonDocument} from '../src/model/dungeonValidation';
import {DEFAULT_PIECES} from '../src/model/pieceLibrary';
import {useDungeonStore} from '../src/store/dungeonStore';
import {auditDataset} from './fixtures/auditDataset';
import {createConnectionSceneResolver} from '../src/editor/connectors/corridor/connectionScene';

test('headless document/room/connection factories preserve fixed identity, numbering and independent snapshots',()=>{
 const d=createDungeonDocument({id:'document',createdAt:'2026-01-01T00:00:00.000Z'}),piece=structuredClone(DEFAULT_PIECES[0]),position={x:0,y:0};
 const a=createPlacedRoom(piece,position,[],0,'a'),b=createPlacedRoom(piece,{x:10,y:0},[a],0,'b');
 const link=createConnection([a,b],[],{roomId:a.id,connectorId:piece.connectors[2].id},{roomId:b.id,connectorId:piece.connectors[3].id},'corridor','link');
 const output=assertDungeonDocument({...d,rooms:[a,b],connections:[link]});assert.equal(output.rooms[1].information.number,'02');
 piece.cells[0].x=99;position.x=99;assert.equal(output.rooms[0].piece.cells[0].x,0);assert.equal(a.position.x,0);
 assert.throws(()=>createConnection([a,b],[link],{roomId:a.id,connectorId:a.piece.connectors[2].id},{roomId:b.id,connectorId:b.piece.connectors[3].id}));
 assert.throws(()=>createPlacedRoom(a.piece,{x:0,y:0},[a],0,'a'));
});
test('domain compound commands do not mutate inputs, preserve strong references and match Store Undo/Redo',()=>{
 const {dungeon:d}=auditDataset(10,30,5),before=structuredClone(d),copy=duplicateRoomDocument(d,d.rooms[0].id);
 assert.deepEqual(d,before);assertDungeonDocument(copy.document);
 const owned=copy.document.encounters.find(e=>e.roomId===copy.roomId)!;assert.notEqual(owned.id,d.encounters[0].id);
 const deleted=deleteEncounterDocument(copy.document,owned.id,false);assert.equal(deleted.entities.length,copy.document.entities.length);assertDungeonDocument(deleted);
 const withEntities=deleteEncounterDocument(copy.document,owned.id,true);assert.equal(withEntities.entities.length,copy.document.entities.length-2);assertDungeonDocument(withEntities);
 const removed=deleteRoomDocument(copy.document,copy.roomId)!;assertDungeonDocument(removed);assert.equal(removed.rooms.length,d.rooms.length);
 const store=()=>useDungeonStore.getState();store().setDungeon(d);const initial=structuredClone(store().dungeon);assert.equal(store().duplicateRoom(d.rooms[0].id),null);
 const after=structuredClone(store().dungeon);store().undo();assert.deepEqual(store().dungeon,initial);store().redo();assert.deepEqual(store().dungeon,after);
});
test('Store placement isolates Piece/position inputs and no-op commands do not change history or physical scene',()=>{
 const store=()=>useDungeonStore.getState();store().newDungeon();const piece=structuredClone(DEFAULT_PIECES[0]),room=createPlacedRoom(piece,{x:0,y:0},[],0,'room');store().addRoom(room);
 room.piece.cells[0].x=99;room.position.x=99;assert.equal(store().dungeon.rooms[0].position.x,0);assert.equal(store().dungeon.rooms[0].piece.cells[0].x,0);
 const resolve=createConnectionSceneResolver(),scene=resolve(store().dungeon.rooms,store().dungeon.connections),count=store().undoStack.length;
 store().moveRoom('room',{x:0,y:0});store().deleteRoom('missing');store().changeFactions({type:'delete-relation',id:'missing'});
 assert.equal(store().undoStack.length,count);assert.strictEqual(resolve(store().dungeon.rooms,store().dungeon.connections),scene);
});
