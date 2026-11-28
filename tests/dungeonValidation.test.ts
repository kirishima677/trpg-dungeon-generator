import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
import {validateDungeonDocument,assertDungeonDocument} from '../src/model/dungeonValidation';
import {normalizeDungeonDocument} from '../src/model/normalizeDungeon';
import {buildExportEnvelope,parseImport} from '../src/utils/exportImport';
import {db} from '../src/db/db';
import {dungeonRepository} from '../src/repository/dungeonRepository';
import {useDungeonStore} from '../src/store/dungeonStore';
import {entityDungeon} from './fixtures/entityFixture';
import {encounterContextFixture,encounterPlanFixture} from './fixtures/encounterFixture';
import {applyEncounterPlan} from '../src/model/encounter/application';
beforeEach(async()=>{await db.dungeons.clear();});after(async()=>{await db.delete();});
test('strict validation, Export and persistence reject duplicate Room IDs and invalid connections without partial writes',async()=>{
 const good=assertDungeonDocument(entityDungeon());await dungeonRepository.save(good);
 for(const change of [(d:typeof good)=>d.rooms.push({...structuredClone(d.rooms[0]),information:{...d.rooms[0].information,number:'03'}}),(d:typeof good)=>{d.connections[0].toRoomId='absent';},(d:typeof good)=>d.connections.push({...d.connections[0],id:'duplicate-endpoint'})]){
  const bad=structuredClone(good);change(bad);const result=validateDungeonDocument(bad);assert.equal(result.valid,false);assert.ok(result.diagnostics.every(d=>d.severity==='error'));
  assert.throws(()=>buildExportEnvelope(bad));await assert.rejects(dungeonRepository.save(bad));assert.deepEqual(await dungeonRepository.load(good.id),good);
 }
 await assert.rejects(dungeonRepository.saveAll([good,{...good,id:'bad',rooms:[good.rooms[0],good.rooms[0]]}]));assert.equal(await db.dungeons.count(),1);
});
test('normalization and Store loading isolate all physical snapshots and metadata from external mutation',()=>{
 const input=entityDungeon(),copy=structuredClone(input),normalized=normalizeDungeonDocument(input);useDungeonStore.getState().setDungeon(input);
 input.rooms[0].piece.cells[0].x=99;input.rooms[0].piece.connectors[0].position.x=99;input.rooms[0].position.x=99;input.meta.gridSize=99;
 assert.equal(normalized.rooms[0].piece.cells[0].x,copy.rooms[0].piece.cells[0].x);assert.equal(normalized.rooms[0].position.x,copy.rooms[0].position.x);assert.equal(normalized.meta.gridSize,40);
 assert.deepEqual(useDungeonStore.getState().dungeon,normalizeDungeonDocument(copy));
});
test('validation accepts legacy migration and weak Library references but rejects broken strong Encounter origins',()=>{
 const ctx=encounterContextFixture(),d={...ctx.dungeon,...applyEncounterPlan(ctx.dungeon,encounterPlanFixture(ctx),ctx.contents,ctx.successfulConnectionIds)};
 assert.equal(validateDungeonDocument(d).valid,true);d.entities.at(-1)!.origin={type:'encounter',encounterInstanceId:'absent',entryId:'entry'};assert.equal(validateDungeonDocument(d).valid,false);
 const old=entityDungeon();old.version='1.0.0';for(const r of old.rooms)delete (r as {information?:unknown}).information;
 assert.equal(validateDungeonDocument(old).valid,true);const imported=parseImport({formatId:'trpg-dungeon-generator',schemaVersion:'1.0.0',dungeon:old});assert.equal(imported.dungeon.rooms[0].information.number,'01');
});
