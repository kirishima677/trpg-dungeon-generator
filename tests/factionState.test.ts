import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
import Dexie from 'dexie';
import {db,DungeonDB} from '../src/db/db';
import {createFactionRepository} from '../src/repository/factionRepository';
import {dungeonRepository} from '../src/repository/dungeonRepository';
import {useDungeonStore} from '../src/store/dungeonStore';
import {factionFixture,factionDungeon} from './fixtures/factionFixture';
import {contentFixture,entityDungeon} from './fixtures/entityFixture';
import {buildExportEnvelope,parseDungeonJson,parseImport} from '../src/utils/exportImport';
import {normalizeDungeonDocument} from '../src/model/normalizeDungeon';
import {createConnectionSceneResolver} from '../src/editor/connectors/corridor/connectionScene';
const state=()=>useDungeonStore.getState();let notices=0;const repo=createFactionRepository(db,()=>notices++);
beforeEach(async()=>{for(const table of db.tables)await table.clear();notices=0;state().setDungeon(factionDungeon());});after(async()=>{await db.delete();});
test('repository CAS is monotonic and stale save/delete never overwrite; no auto-save/source changes',async()=>{
 const f=await repo.save(factionFixture(),null);const latest=await repo.save({...f,name:'更新'},f.updatedAt);assert.ok(latest.updatedAt>f.updatedAt);await assert.rejects(repo.save({...f,name:'競合'},f.updatedAt));await assert.rejects(repo.delete(f.id,f.updatedAt));assert.equal((await repo.get(f.id))!.name,'更新');assert.equal(state().dungeon.factions[0].factionSnapshot.name,'FACTION_PRIVATE_NAME');assert.equal(notices,2);
});
test('batch import reuses identical definitions and supports skip/new-ID while preserving weak IDs; invalid batch is atomic',async()=>{
 const f=factionFixture();assert.equal((await repo.saveMany([f],'skip')).added,1);assert.equal((await repo.saveMany([{...f,updatedAt:'2027-01-01T00:00:00.000Z'}],'skip')).reused,1);assert.equal((await repo.saveMany([{...f,name:'other'}],'skip')).skipped,1);assert.equal((await repo.saveMany([{...f,name:'other'}],'new-id')).reidentified,1);await assert.rejects(repo.saveMany([factionFixture('new'),{...factionFixture('bad'),behavior:false} as never],'skip'));assert.equal(await repo.get('new'),undefined);assert.equal((await repo.list()).length,2);
});
test('storage failure rolls back whole import transaction and emits no update',async()=>{
 const add=db.factionDefinitions.add.bind(db.factionDefinitions);let calls=0;db.factionDefinitions.add=(async(...args:Parameters<typeof add>)=>{if(++calls===2)throw new Error('disk failed');return add(...args);}) as typeof add;
 try{await assert.rejects(repo.saveMany([factionFixture('one'),factionFixture('two')],'skip'),/disk failed/);assert.equal(await db.factionDefinitions.count(),0);assert.equal(notices,0);}finally{db.factionDefinitions.add=add;}
});
test('instance/relations/territory/delete operations are atomic single-history events; exact Undo/Redo without Library',()=>{
 const before=structuredClone(state().dungeon),id=before.factions[0].id;assert.equal(state().changeFactions({type:'delete',id}),null);const after=structuredClone(state().dungeon);assert.equal(state().undoStack.length,1);state().undo();assert.deepEqual(state().dungeon,before);state().redo();assert.deepEqual(state().dungeon,after);assert.equal(state().changeFactions({type:'assign-rooms',assignments:[{...before.roomFactionAssignments[0],controllingFactionId:'invalid'}]}), '支配勢力の参照が不正または重複しています。');assert.deepEqual(state().dungeon,after);assert.equal(state().undoStack.length,1);
});
test('Entity manual membership permits only existing instance IDs/Monster/NPC, stays independent from territory and survives move/dup',()=>{
 const d=state().dungeon,e=d.entities[0],id=d.factions[2].id;
 assert.equal(state().changeEntities({type:'edit',id:e.id,edits:e,factionId:id}),null);assert.equal(state().dungeon.entities[0].factionId,id);assert.equal(state().dungeon.roomFactionAssignments[0].controllingFactionId,d.factions[0].id);
 assert.ok(state().changeEntities({type:'edit',id:e.id,edits:e,factionId:'missing'}));assert.equal(state().dungeon.entities[0].factionId,id);
 state().changeEntities({type:'duplicate',id:e.id});assert.equal(state().dungeon.entities.at(-1)!.factionId,id);state().changeEntities({type:'move',id:e.id,roomId:d.rooms[1].id});assert.equal(state().dungeon.entities[0].factionId,id);state().changeEntities({type:'edit',id:e.id,edits:e,factionId:null});assert.equal(state().dungeon.entities[0].factionId,undefined);
 state().changeEntities({type:'add',roomId:d.rooms[0].id,content:contentFixture('object'),quantity:2});const object=state().dungeon.entities.at(-1)!;assert.equal(object.factionId,undefined);assert.ok(state().changeEntities({type:'edit',id:object.id,edits:object,factionId:id}));
});
test('room duplication preserves assignment/membership/origins and deletion removes only local state',()=>{
 const d=state().dungeon;d.entities[0].origin={type:'room-theme-required',sourceRoomThemeId:'source',requiredEntryId:'entry'};state().setDungeon(d);assert.equal(state().duplicateRoom(d.rooms[0].id),null);const copied=state().dungeon.rooms.at(-1)!;assert.notEqual(copied.id,d.rooms[0].id);const assignment=state().dungeon.roomFactionAssignments.find(a=>a.roomId===copied.id)!;assert.equal(assignment.controllingFactionId,d.factions[0].id);const member=state().dungeon.entities.find(e=>e.roomId===copied.id&&e.contentSnapshot.kind==='monster')!;assert.equal(member.factionId,d.factions[0].id);assert.deepEqual(member.origin,d.entities[0].origin);state().deleteRoom(d.rooms[0].id);assert.equal(state().dungeon.factions.length,3);assert.equal(state().dungeon.factionRelations.length,1);assert.equal(state().dungeon.roomFactionAssignments.some(a=>a.roomId===d.rooms[0].id),false);assert.equal(state().dungeon.entities.find(e=>e.id===member.id)!.factionId,d.factions[0].id);
});
test('overlay toggle and Faction metadata do not rebuild routing or mutate the document/history',()=>{
 const d=state().dungeon,cache=createConnectionSceneResolver(),first=cache(d.rooms,d.connections);state().setShowFactions(true);assert.strictEqual(state().dungeon,d);assert.equal(state().undoStack.length,0);const f=d.factions[0];state().changeFactions({type:'edit',id:f.id,edits:{...f,customName:'changed'}});assert.strictEqual(cache(state().dungeon.rooms,state().dungeon.connections),first);assert.equal(state().showFactions,true);assert.equal(Object.hasOwn(state().dungeon,'showFactions'),false);state().setShowFactions(false);
});
test('schema 1.6 roundtrip preserves complete state/IDs without registering source definitions',async()=>{
 const d=state().dungeon,envelope=buildExportEnvelope(d);assert.equal(envelope.schemaVersion,'1.7.0');const loaded=parseDungeonJson(JSON.stringify(envelope)).dungeon;assert.deepEqual(loaded,d);await dungeonRepository.save(loaded);assert.deepEqual(await dungeonRepository.load(d.id),d);assert.equal(await db.factionDefinitions.count(),0);assert.equal(await db.contentDefinitions.count(),0);
});
test('legacy 1.0–1.5 projects default to empty state; malformed current state, missing arrays and broken refs reject',()=>{
 for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0','1.4.0','1.5.0']){const d=parseImport({formatId:'trpg-dungeon-generator',schemaVersion:version,dungeon:{...entityDungeon(),version}}).dungeon;assert.deepEqual(d.factions,[]);assert.deepEqual(d.factionRelations,[]);assert.deepEqual(d.roomFactionAssignments,[]);}
 assert.throws(()=>parseImport({formatId:'trpg-dungeon-generator',schemaVersion:'1.6.0',dungeon:entityDungeon()}));const e=buildExportEnvelope(state().dungeon);e.dungeon.entities[0].factionId='missing';assert.throws(()=>parseImport(e));assert.throws(()=>normalizeDungeonDocument({...state().dungeon,factions:null} as never));
});
test('legacy partial main and Markdown saves preserve all Faction state and membership',async()=>{
 const original=state().dungeon;await dungeonRepository.save(original);const {factions:_f,factionRelations:_r,roomFactionAssignments:_a,...base}=original;const old={...base,version:'1.5.0',name:'旧画面から保存',entities:base.entities.map(e=>{const {factionId:_id,...rest}=e;return rest;})};await dungeonRepository.saveMainEditorSnapshot(old);await dungeonRepository.saveMarkdown(original.id,'# 別画面の本文',original.updatedAt);const loaded=(await dungeonRepository.load(original.id))!;assert.deepEqual(loaded.factions,original.factions);assert.deepEqual(loaded.factionRelations,original.factionRelations);assert.deepEqual(loaded.roomFactionAssignments,original.roomFactionAssignments);assert.deepEqual(loaded.entities,original.entities);assert.equal(loaded.markdown,'# 別画面の本文');assert.equal(loaded.name,old.name);
});
test('v4→v5 adds only Faction table, preserves original raw bytes in every older table',async()=>{
 await db.close();await Dexie.delete('TRPGDungeonDB');const old=new Dexie('TRPGDungeonDB');old.version(4).stores({dungeons:'id,name,updatedAt',pieceLibrary:'id,name,shape',settings:'key',contentDefinitions:'id,kind,name,updatedAt',dungeonThemes:'id,name,genre,category,updatedAt',roomThemes:'id,name,genre,category,updatedAt'});await old.open();const d=entityDungeon();await old.table('dungeons').add(d);const records=[['pieceLibrary',{id:'piece',name:'old'}],['settings',{key:'setting',value:{x:1}}],['contentDefinitions',contentFixture()],['dungeonThemes',{id:'theme',name:'old'}],['roomThemes',{id:'room-theme',name:'old'}]] as const;for(const [table,value]of records)await old.table(table).add(value);old.close();const next=new DungeonDB();try{await next.open();assert.equal(next.verno,6);assert.equal(await next.factionDefinitions.count(),0);assert.deepEqual(await next.dungeons.get(d.id),d);for(const [table,value]of records)assert.deepEqual((await next.table(table).toArray())[0],value);}finally{await next.delete();await db.open();}
});

test('deleting the source definition preserves all instances/history and survives repository reopen',async()=>{
 const f=await repo.save(factionFixture(),null),before=structuredClone(state().dungeon);await repo.delete(f.id,f.updatedAt);assert.equal(await repo.get(f.id),undefined);assert.deepEqual(state().dungeon,before);assert.equal(state().undoStack.length,0);await db.close();await db.open();assert.deepEqual(await repo.list(),[]);assert.equal(state().dungeon.factions[0].factionSnapshot.name,f.name);
});
