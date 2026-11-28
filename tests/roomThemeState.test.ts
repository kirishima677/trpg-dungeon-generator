import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after,beforeEach,test } from 'node:test';
import { db } from '../src/db/db';
import { createRoomThemeRepository } from '../src/repository/roomThemeRepository';
import { createThemeRepository } from '../src/repository/themeRepository';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { useDungeonStore } from '../src/store/dungeonStore';
import { roomThemeFixture,requiredFixture } from './fixtures/roomThemeFixture';
import { contentFixture,entityDungeon } from './fixtures/entityFixture';
import { CONTENT_KINDS } from '../src/model/content';
import { prepareRequiredPlacement,requiredPlacementRevision } from '../src/model/roomThemePlacement';
import { normalizeDungeonDocument } from '../src/model/normalizeDungeon';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { createConnectionSceneResolver } from '../src/editor/connectors/corridor/connectionScene';
import { buildExportEnvelope,parseDungeonJson,parseImport } from '../src/utils/exportImport';
import { snapshotWithSavedMarkdown } from '../src/publishing/publishSnapshot';
import { collectPieceReferences } from '../src/editor/pieces/pieceReferences';
const state=()=>useDungeonStore.getState(),contents=CONTENT_KINDS.map(k=>contentFixture(k));let notifications=0;
const repo=createRoomThemeRepository(db,()=>{notifications++;});
const revision=()=>requiredPlacementRevision(state().dungeon,'room-0',contents,DEFAULT_PIECES);
const place=(allow=false)=>state().placeRequiredContents('room-0',contents,DEFAULT_PIECES,revision(),allow);
beforeEach(async()=>{for(const t of db.tables)await t.clear();notifications=0;state().setDungeon(entityDungeon());state().selectRoom('room-0');});
after(async()=>{await db.delete();});
test('Room repository CRUD keeps stable IDs and creation dates, monotonic revisions and persisted values across reopen',async()=>{
  const a=await repo.save(roomThemeFixture(),null),b=await repo.save({...a,purpose:'変更後'},a.updatedAt);assert.equal(b.id,a.id);assert.equal(b.createdAt,a.createdAt);assert.ok(b.updatedAt>a.updatedAt);db.close();await db.open();assert.deepEqual(await repo.get(a.id),b);assert.deepEqual(await repo.list(),[b]);await repo.delete(b.id,b.updatedAt);assert.equal(await repo.get(a.id),undefined);assert.equal(notifications,3);
});
test('concurrent Room saves and stale delete never overwrite a newer revision; deleted drafts cannot recreate the record',async()=>{
  const a=await repo.save(roomThemeFixture(),null),results=await Promise.allSettled(['one','two'].map(name=>repo.save({...a,name},a.updatedAt)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);await assert.rejects(repo.save(a,null));await assert.rejects(repo.delete(a.id,a.updatedAt));const latest=(await repo.get(a.id))!;await repo.delete(latest.id,latest.updatedAt);await assert.rejects(repo.save(latest,latest.updatedAt));
});
test('Room import reuses equal definitions, explicitly skips or reidentifies conflicts and leaves all other libraries/dungeon/history alone',async()=>{
  const t=roomThemeFixture(),before=structuredClone({d:state().dungeon,u:state().undoStack,r:state().redoStack});await repo.saveMany([t],'skip');assert.deepEqual(await repo.saveMany([{...t,tags:[...t.tags].reverse(),updatedAt:'2026-12-01T00:00:00.000Z'}],'skip'),{added:0,reused:1,skipped:0,reidentified:0});assert.equal((await repo.saveMany([{...t,purpose:'別用途'}],'skip')).skipped,1);const report=await repo.saveMany([{...t,purpose:'別用途'}],'new-id');assert.equal(report.added,1);assert.equal(report.reidentified,1);assert.deepEqual(await repo.get(t.id),t);assert.deepEqual({d:state().dungeon,u:state().undoStack,r:state().redoStack},before);assert.equal(await db.dungeonThemes.count(),0);assert.equal(await db.contentDefinitions.count(),0);assert.equal(await db.pieceLibrary.count(),0);
});
test('Room batch import validates all rows and rolls back write failures without partial registration or success notification',async()=>{
  await assert.rejects(repo.saveMany([roomThemeFixture('a'),{...roomThemeFixture('b'),purpose:null}as never],'skip'));const fail=(_key:unknown,value:{id:string})=>{if(value.id==='b')throw new Error('容量不足');};db.roomThemes.hook('creating',fail);try{await assert.rejects(repo.saveMany([roomThemeFixture('a'),roomThemeFixture('b')],'skip'),/容量不足/);}finally{db.roomThemes.hook('creating').unsubscribe(fail);}assert.equal(await db.roomThemes.count(),0);assert.equal(notifications,0);
});
test('Room apply/change/refresh/clear each preserve RoomInformation, Piece, transform, Connections, Entities and Markdown with one history step',()=>{
  state().changeEntities({type:'add',roomId:'room-0',content:contentFixture(),quantity:2});const original=state().dungeon,resolver=createConnectionSceneResolver(),scene=resolver(original.rooms,original.connections);
  for(const value of [roomThemeFixture(),roomThemeFixture('other'),{...roomThemeFixture('other'),purpose:'新用途'},null]){
    const prior=state().dungeon,previous=structuredClone(prior.rooms[0].roomTheme),count=state().undoStack.length;assert.equal(state().assignRoomTheme('room-0',value),null);const after=structuredClone(state().dungeon.rooms[0].roomTheme);assert.equal(state().undoStack.length,count+1);assert.equal(state().dungeon.entities,prior.entities);assert.equal(state().dungeon.connections,prior.connections);assert.equal(state().dungeon.rooms[0].piece,prior.rooms[0].piece);assert.equal(state().dungeon.rooms[0].information,prior.rooms[0].information);assert.equal(state().dungeon.rooms[1],prior.rooms[1]);
    for(const action of [()=>{},()=>state().undo(),()=>state().redo()]){action();assert.equal(resolver(state().dungeon.rooms,state().dungeon.connections),scene);const {roomTheme:_removed,...room}=state().dungeon.rooms[0];assert.deepEqual(room,original.rooms[0]);assert.deepEqual(state().dungeon.entities,original.entities);assert.equal(state().dungeon.markdown,original.markdown);}
    state().undo();assert.deepEqual(state().dungeon.rooms[0].roomTheme,previous);state().redo();assert.deepEqual(state().dungeon.rooms[0].roomTheme,after);
  }
  const count=state().undoStack.length;state().assignRoomTheme('room-0',null);assert.equal(state().undoStack.length,count);assert.ok(state().assignRoomTheme('missing',roomThemeFixture()));assert.equal(Object.hasOwn(state().dungeon.rooms[0],'roomTheme'),false);
});
test('Room Library updates/deletion cannot change applied snapshots or existing Entities, and history never reloads definitions',async()=>{
  const t=await repo.save(roomThemeFixture(),null);state().assignRoomTheme('room-0',t);place();const before=structuredClone(state().dungeon);const updated=await repo.save({...t,purpose:'改訂',requiredContents:[]},t.updatedAt);assert.deepEqual(state().dungeon,before);state().assignRoomTheme('room-0',updated);assert.deepEqual(state().dungeon.entities,before.entities);await repo.delete(updated.id,updated.updatedAt);state().undo();assert.deepEqual(state().dungeon.rooms[0].roomTheme,before.rooms[0].roomTheme);state().redo();assert.equal(state().dungeon.rooms[0].roomTheme!.themeSnapshot.purpose,'改訂');
});
test('required batch uses the existing Entity factory with independent current snapshots and all entry initialization fields',()=>{
  const theme=roomThemeFixture();theme.requiredContents=CONTENTS();state().assignRoomTheme('room-0',theme);const plan=prepareRequiredPlacement(state().dungeon,'room-0',contents,DEFAULT_PIECES);assert.equal(plan.blockers.length,0);assert.equal(plan.added.length,6);const count=state().undoStack.length;assert.equal(place(),null);assert.equal(state().undoStack.length,count+1);
  for(const [n,e]of state().dungeon.entities.entries()){const entry=theme.requiredContents[n];assert.notEqual(e.id,entry.id);assert.equal(e.quantity,entry.quantity);assert.equal(e.customName,entry.customName);assert.equal(e.visibility,entry.visibility);assert.equal(e.publicDescription,entry.publicDescription);assert.equal(e.gmNotes,entry.gmNotes);assert.deepEqual(e.origin,{type:'room-theme-required',sourceRoomThemeId:theme.id,requiredEntryId:entry.id});assert.deepEqual(e.contentSnapshot,contents[n]);assert.notEqual(e.contentSnapshot,contents[n]);}
  state().dungeon.entities[0].contentSnapshot.attributes.hp=99;assert.equal(contents[0].attributes.hp,7);
});
function CONTENTS(){return CONTENT_KINDS.map((kind,n)=>({...requiredFixture(`entry-${n}`,kind),quantity:n+1,customName:`個別${n}`,publicDescription:`公開${n}`,gmNotes:`秘密${n}`,visibility:n%2?'public' as const:'gm-only' as const}));}
test('required reruns skip matching origins, retain hand edits/quantity differences and re-add only a deleted entry',()=>{
  const theme=roomThemeFixture();theme.requiredContents=[requiredFixture('one'),requiredFixture('two')];state().assignRoomTheme('room-0',theme);assert.equal(place(),null);const first=state().dungeon.entities[0];state().changeEntities({type:'edit',id:first.id,edits:{...first,quantity:9,customName:'手動編集',publicDescription:'公開変更',gmNotes:'手動GM',visibility:'public'}});
  const count=state().undoStack.length,before=structuredClone(state().dungeon.entities);assert.equal(place(),null);assert.equal(state().undoStack.length,count);assert.deepEqual(state().dungeon.entities,before);const plan=prepareRequiredPlacement(state().dungeon,'room-0',contents,DEFAULT_PIECES);assert.equal(plan.entries[0].currentQuantity,9);assert.equal(plan.entries[0].quantityDifference,-5);
  state().changeEntities({type:'delete',id:first.id});assert.equal(place(),null);assert.equal(state().dungeon.entities.length,2);assert.notEqual(state().dungeon.entities[1].id,first.id);assert.equal(state().dungeon.entities[1].quantity,4);
});
test('manual same-Content Entities do not satisfy required entries; two entries for the same Content become two separate grouped Entities',()=>{
  state().changeEntities({type:'add',roomId:'room-0',content:contentFixture('object'),quantity:4});const t=roomThemeFixture();t.requiredContents.push(requiredFixture('second'));state().assignRoomTheme('room-0',t);assert.equal(place(),null);assert.equal(state().dungeon.entities.length,3);assert.ok(!state().dungeon.entities[0].origin);assert.notEqual(state().dungeon.entities[1].origin?.requiredEntryId,state().dungeon.entities[2].origin?.requiredEntryId);
});
for(const problem of ['missing','kind-mismatch','snapshot-size','per-room','dungeon-total','entity-bytes']as const)test(`required placement atomically rejects ${problem} without changes or history`,()=>{
  const theme=roomThemeFixture();theme.requiredContents=[requiredFixture('a'),requiredFixture('b','monster')];state().assignRoomTheme('room-0',theme);let inputs=structuredClone(contents);
  if(problem==='missing')inputs=inputs.filter(c=>c.kind!=='monster');if(problem==='kind-mismatch')inputs=inputs.map(c=>c.kind==='monster'?{...c,kind:'treasure'}:c);
  if(problem==='snapshot-size')inputs=inputs.map(c=>({...c,description:'日'.repeat(100000)}));
  if(problem==='per-room')for(let i=0;i<49;i++)state().changeEntities({type:'add',roomId:'room-0',content:contentFixture(),quantity:1});
  if(problem==='dungeon-total'){
    const d=state().dungeon;state().setDungeon({...d,rooms:Array.from({length:11},(_,n)=>({...d.rooms[0],id:`room-${n}`,position:{x:n*8,y:0},information:{...d.rooms[0].information,number:String(n+1)}})),connections:[]});
    for(let i=0;i<499;i++)state().changeEntities({type:'add',roomId:`room-${1+Math.floor(i/50)}`,content:contentFixture(),quantity:1});
  }
  if(problem==='entity-bytes'){
    const d=state().dungeon;state().setDungeon({...d,rooms:[...d.rooms,...Array.from({length:4},(_,n)=>({...d.rooms[1],id:`extra-${n}`,position:{x:20+n*8,y:0},information:{...d.rooms[1].information,number:String(n+3)}}))]});
    const big={...contentFixture(),description:'x'.repeat(100000),gmNotes:'x'.repeat(100000)};
    for(let i=0;i<41;i++)state().changeEntities({type:'add',roomId:'room-1',content:big,quantity:1});
    inputs=inputs.map(c=>({...c,description:'x'.repeat(100000),gmNotes:'x'.repeat(100000)}));
  }
  const prior=state().dungeon,count=state().undoStack.length,rev=requiredPlacementRevision(prior,'room-0',inputs,DEFAULT_PIECES);assert.ok(state().placeRequiredContents('room-0',inputs,DEFAULT_PIECES,rev,true));assert.equal(state().dungeon,prior);assert.equal(state().undoStack.length,count);
});
test('candidate conflicts require explicit acknowledgement, while a fully placed conflicting plan stays a no-op',()=>{
  const t=roomThemeFixture();t.contentSelection.object.mode='none';state().assignRoomTheme('room-0',t);assert.match(place()!,/競合/);assert.equal(state().dungeon.entities.length,0);assert.equal(place(true),null);const count=state().undoStack.length;assert.equal(place(),null);assert.equal(state().undoStack.length,count);
});
test('a reviewed plan cannot execute after applied policies, materials or existing Entities change',()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());const rev=revision();state().changeEntities({type:'add',roomId:'room-1',content:contentFixture(),quantity:1});assert.match(state().placeRequiredContents('room-0',contents,DEFAULT_PIECES,rev)!,/変わりました/);assert.equal(state().dungeon.entities.length,1);
});
test('batch Undo/Redo restores exactly the generated IDs and snapshots without reading current Content',()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());const prior=structuredClone(state().dungeon.entities);assert.equal(place(),null);const added=structuredClone(state().dungeon.entities);state().undo();assert.deepEqual(state().dungeon.entities,prior);const changed=structuredClone(contents);changed[3].attributes.hp=900;state().redo();assert.deepEqual(state().dungeon.entities,added);assert.equal(state().dungeon.entities[0].contentSnapshot.attributes.hp,7);
});
test('Entity moves and individual duplicates clear origin; refresh/edit preserve it; whole-room duplication preserves origin and independent snapshots',()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());place();const initial=state().dungeon.entities[0];state().changeEntities({type:'refresh',id:initial.id,content:{...contentFixture('object'),name:'最新素材'}});assert.deepEqual(state().dungeon.entities[0].origin,initial.origin);
  state().changeEntities({type:'duplicate',id:initial.id});assert.ok(!state().dungeon.entities[1].origin);state().changeEntities({type:'move',id:initial.id,roomId:'room-1'});assert.ok(!state().dungeon.entities[0].origin);assert.equal(place(),null);
  const source=structuredClone(state().dungeon),count=state().undoStack.length;assert.equal(state().duplicateRoom('room-0'),null);const copy=state().dungeon.rooms.at(-1)!,copiedEntities=state().dungeon.entities.filter(e=>e.roomId===copy.id);assert.notEqual(copy.id,'room-0');assert.notEqual(copy.information.number,source.rooms[0].information.number);assert.deepEqual(copy.roomTheme,source.rooms[0].roomTheme);assert.notEqual(copy.roomTheme,source.rooms[0].roomTheme);assert.equal(copiedEntities.length,2);assert.ok(copiedEntities.some(e=>e.origin?.requiredEntryId===initial.origin!.requiredEntryId));assert.equal(state().undoStack.length,count+1);state().undo();assert.deepEqual(state().dungeon.rooms,source.rooms);state().redo();assert.equal(state().dungeon.rooms.at(-1)!.id,copy.id);
});
test('Room deletion atomically removes Theme and Entities; moving/rotating preserves Theme and deleting Library entries does not invalidate origin',async()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());place();const before=structuredClone(state().dungeon);state().moveRoom('room-0',{x:0,y:5});state().rotateRoom('room-0');assert.deepEqual(state().dungeon.rooms[0].roomTheme,before.rooms[0].roomTheme);state().deleteRoom('room-0');assert.equal(state().dungeon.entities.length,0);state().undo();assert.deepEqual(state().dungeon.entities,before.entities);await dungeonRepository.save(state().dungeon);assert.deepEqual((await dungeonRepository.load(before.id))!.entities,before.entities);
});
test('JSON 1.5 restores Room Theme/required origins without libraries; legacy 1.0–1.4 remains optional and invalid origins/assignments reject',async()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());place();const data=buildExportEnvelope(state().dungeon);assert.equal(data.schemaVersion,'1.6.0');const loaded=parseDungeonJson(JSON.stringify(data)).dungeon;assert.deepEqual(loaded.rooms[0].roomTheme,state().dungeon.rooms[0].roomTheme);assert.deepEqual(loaded.entities,state().dungeon.entities);await dungeonRepository.save(loaded);assert.equal(await db.roomThemes.count(),0);assert.equal(await db.contentDefinitions.count(),0);
  for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0','1.4.0']){const parsed=parseImport({formatId:'trpg-dungeon-generator',schemaVersion:version,dungeon:{...entityDungeon(),version}}).dungeon;assert.ok(parsed.rooms.every(r=>!Object.hasOwn(r,'roomTheme')));}
  for(const origin of [{type:'other',sourceRoomThemeId:'a',requiredEntryId:'b'},{type:'room-theme-required',sourceRoomThemeId:'',requiredEntryId:'b'},null]){const bad=structuredClone(data);bad.dungeon.entities[0].origin=origin as never;assert.throws(()=>parseImport(bad));}
  const bad=structuredClone(data);bad.dungeon.rooms[0].roomTheme!.sourceThemeId='wrong';assert.throws(()=>parseImport(bad));
});
test('new/current and legacy partial saves preserve separately saved Markdown, distinguish absence/null and retain snapshots without re-registering libraries',async()=>{
  state().assignRoomTheme('room-0',roomThemeFixture());place();const source=state().dungeon;await dungeonRepository.save(source);await dungeonRepository.saveMarkdown(source.id,'# 別窓Markdown','2026-11-28T00:00:00.000Z');
  const rooms=source.rooms.map(({roomTheme:_theme,...r})=>r);await dungeonRepository.saveMainEditorSnapshot({...source,version:'1.4.0',rooms});assert.deepEqual((await dungeonRepository.load(source.id))!.rooms[0].roomTheme,source.rooms[0].roomTheme);
  const snap=await snapshotWithSavedMarkdown(source,id=>dungeonRepository.load(id));assert.deepEqual(snap.rooms[0].roomTheme,source.rooms[0].roomTheme);assert.equal(snap.markdown,'# 別窓Markdown');
  await dungeonRepository.saveMainEditorSnapshot({...source,rooms});const clear=(await dungeonRepository.load(source.id))!;assert.ok(!Object.hasOwn(clear.rooms[0],'roomTheme'));assert.equal(clear.markdown,'# 別窓Markdown');assert.equal(normalizeDungeonDocument({...source,rooms:source.rooms.map(r=>({...r,roomTheme:null}))}as never).rooms[0].roomTheme,undefined);
});
test('Room/Dungeon selection and required references stay weak and never register materials or block deletion as placed-piece references',async()=>{
  const theme=roomThemeFixture();theme.pieceSelection.includePieceIds=['weak-piece'];theme.requiredContents[0].contentId='missing';await repo.saveMany([theme],'skip');state().assignRoomTheme('room-0',theme);assert.ok(!collectPieceReferences([state().dungeon],null).includes('weak-piece'));await createThemeRepository(db,()=>{}).save({...newThemeFixture(),roomThemeSelection:{mode:'explicit',includeRoomThemeIds:[theme.id],excludeRoomThemeIds:[],tags:{allOf:[],anyOf:[],noneOf:[]}}},null);await repo.delete(theme.id,theme.updatedAt);assert.equal(state().dungeon.rooms[0].roomTheme!.themeSnapshot.id,theme.id);
});
import { themeFixture as newThemeFixture } from './fixtures/themeFixture';
