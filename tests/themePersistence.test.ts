import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from '../src/db/db';
import { createThemeRepository } from '../src/repository/themeRepository';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { createContentRepository } from '../src/repository/contentRepository';
import { pieceRepository } from '../src/repository/pieceRepository';
import { themeFixture } from './fixtures/themeFixture';
import { contentFixture, entityDungeon } from './fixtures/entityFixture';
import { useDungeonStore } from '../src/store/dungeonStore';
import { normalizeDungeonDocument } from '../src/model/normalizeDungeon';
import { createThemeAssignment } from '../src/model/dungeonTheme';
import { buildExportEnvelope, parseImport, parseDungeonJson } from '../src/utils/exportImport';
import { createConnectionSceneResolver } from '../src/editor/connectors/corridor/connectionScene';
import { snapshotWithSavedMarkdown } from '../src/publishing/publishSnapshot';
import { collectPieceReferences } from '../src/editor/pieces/pieceReferences';

let notices=0;
const repository=createThemeRepository(db,()=>{notices++;}), state=()=>useDungeonStore.getState();
beforeEach(async()=> { for(const table of db.tables) await table.clear(); notices=0; state().setDungeon(entityDungeon()); });
after(async()=>{await db.delete();});
test('repository saves only on explicit calls, keeps ID/createdAt, advances revision and survives reopen/delete', async()=> {
  const initial=themeFixture(), saved=await repository.save(initial,null); assert.equal(saved.id,initial.id);assert.equal(saved.createdAt,saved.updatedAt);
  const updated=await repository.save({...saved,name:'更新'},saved.updatedAt);assert.equal(updated.createdAt,saved.createdAt);assert.ok(updated.updatedAt>saved.updatedAt);
  db.close();await db.open();assert.deepEqual(await repository.list(),[updated]);await repository.delete(updated.id,updated.updatedAt);
  assert.equal(await repository.get(saved.id),undefined);assert.equal(notices,3);
});
test('concurrent theme edits accept one writer and reject stale updates, creates and deletes without overwriting', async()=> {
  const t=await repository.save(themeFixture(),null), results=await Promise.allSettled(['one','two'].map(name=>repository.save({...t,name},t.updatedAt)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(results.filter(r=>r.status==='rejected').length,1);
  await assert.rejects(repository.save(t,null),/別ウィンドウ/);await assert.rejects(repository.delete(t.id,t.updatedAt),/別ウィンドウ/);
  const latest=(await repository.get(t.id))!;await repository.delete(latest.id,latest.updatedAt);await assert.rejects(repository.save(latest,latest.updatedAt),/別ウィンドウ/);
});
test('import reuses equal themes ignoring dates/set order, skips conflicts or creates an independent ID', async()=> {
  const t=themeFixture();await repository.saveMany([t],'skip');
  assert.deepEqual(await repository.saveMany([{...t,tags:[...t.tags].reverse(),updatedAt:'2026-12-01T00:00:00.000Z'}],'skip'),{added:0,reused:1,skipped:0,reidentified:0});
  assert.deepEqual(await repository.saveMany([{...t,name:'別の定義'}],'skip'),{added:0,reused:0,skipped:1,reidentified:0});
  assert.deepEqual(await repository.saveMany([{...t,name:'別の定義'}],'new-id'),{added:1,reused:0,skipped:0,reidentified:1});
  assert.deepEqual(await repository.get(t.id),t);const other=(await repository.list()).find(x=>x.id!==t.id)!;
  assert.equal(other.name,'別の定義');assert.notEqual(other.createdAt,t.createdAt);assert.deepEqual(other.pieceSelection,t.pieceSelection);assert.equal(notices,2);
});
test('invalid and failed batch imports roll back atomically and never announce success', async()=> {
  await assert.rejects(repository.saveMany([themeFixture('a'),{...themeFixture('b'),name:''}],'skip'));
  assert.equal(await db.dungeonThemes.count(),0);
  const fail=(_key:unknown,value:{id:string})=>{if(value.id==='b')throw new Error('容量不足');};db.dungeonThemes.hook('creating',fail);
  try{await assert.rejects(repository.saveMany([themeFixture('a'),themeFixture('b')],'skip'),/容量不足/);}finally{db.dungeonThemes.hook('creating').unsubscribe(fail);}
  assert.equal(await db.dungeonThemes.count(),0);assert.equal(notices,0);
});
test('library CRUD/import changes neither dungeon/history nor material libraries and preserves unresolved IDs', async()=> {
  const content=createContentRepository(db,()=>{});await content.saveMany([contentFixture()],'skip');
  const before=structuredClone({dungeon:state().dungeon,undo:state().undoStack,redo:state().redoStack,contents:await content.list()});
  const t=themeFixture();t.pieceSelection.includePieceIds=['missing'];await repository.saveMany([t],'skip');
  const saved=(await repository.get(t.id))!;await repository.delete(t.id,saved.updatedAt);
  assert.deepEqual({dungeon:state().dungeon,undo:state().undoStack,redo:state().redoStack,contents:await content.list()},before);
  assert.equal(await db.pieceLibrary.count(),0);
});
test('apply/change/clear/refresh each create one undo step and preserve physical, story and Entity references/routing',()=> {
  state().changeEntities({type:'add',roomId:'room-0',content:contentFixture(),quantity:3});
  const before=state().dungeon, resolve=createConnectionSceneResolver(), scene=resolve(before.rooms,before.connections);
  for(const next of [themeFixture(),themeFixture('other'),{...themeFixture('other'),name:'最新版'},null]){
    const physical=state().dungeon,old=structuredClone(physical.theme),count=state().undoStack.length;
    assert.equal(state().assignTheme(next),null);const changed=structuredClone(state().dungeon.theme);
    assert.equal(state().undoStack.length,count+1);assert.equal(state().dungeon.rooms,physical.rooms);assert.equal(state().dungeon.entities,physical.entities);assert.equal(state().dungeon.connections,physical.connections);
    for(const run of [()=>{},()=>state().undo(),()=>state().redo()]){run();const current=state().dungeon;assert.deepEqual(current.rooms,before.rooms);assert.deepEqual(current.entities,before.entities);assert.deepEqual(current.connections,before.connections);assert.equal(current.markdown,before.markdown);assert.equal(resolve(current.rooms,current.connections),scene);}
    state().undo();assert.deepEqual(state().dungeon.theme,old);state().redo();assert.deepEqual(state().dungeon.theme,changed);
  }
  assert.equal(Object.hasOwn(state().dungeon,'theme'),false);const count=state().undoStack.length;state().assignTheme(null);assert.equal(state().undoStack.length,count);
  assert.ok(state().assignTheme({...themeFixture(),name:''}));assert.equal(state().undoStack.length,count);
});
test('applied snapshots remain independent through library updates/deletion and history never re-reads the repository', async()=> {
  const t=await repository.save(themeFixture(),null);state().assignTheme(t);const assigned=structuredClone(state().dungeon.theme);
  const newer=await repository.save({...t,name:'ライブラリ更新'},t.updatedAt);assert.deepEqual(state().dungeon.theme,assigned);
  state().assignTheme(newer);await repository.delete(newer.id,newer.updatedAt);state().undo();assert.deepEqual(state().dungeon.theme,assigned);
  state().redo();assert.equal(state().dungeon.theme!.themeSnapshot.name,'ライブラリ更新');
  newer.tags.push('mutated');assert.equal(state().dungeon.theme!.themeSnapshot.tags.length,2);
  await dungeonRepository.save(state().dungeon);assert.deepEqual((await dungeonRepository.load(state().dungeon.id))!.theme,state().dungeon.theme);
});
test('schema 1.4 project restores a Theme snapshot with no Library and does not auto-register any weak references', async()=> {
  const source={...entityDungeon(),theme:createThemeAssignment(themeFixture())}, data=buildExportEnvelope(source);assert.equal(data.schemaVersion,'1.5.0');
  const parsed=parseDungeonJson(JSON.stringify(data)).dungeon;assert.deepEqual(parsed.theme,source.theme);
  await pieceRepository.registerDungeonPieces(parsed);await dungeonRepository.save(parsed);assert.deepEqual((await dungeonRepository.load(parsed.id))!.theme,source.theme);
  assert.equal(await db.dungeonThemes.count(),0);assert.equal(await db.contentDefinitions.count(),0);
});
test('legacy projects 1.0–1.3 remain theme-optional; null/undefined canonicalize to an absent key and invalid snapshots reject',()=> {
  for(const version of ['1.0.0','1.1.0','1.2.0','1.3.0']){const d=parseImport({formatId:'trpg-dungeon-generator',schemaVersion:version,dungeon:{...entityDungeon(),version}}).dungeon;assert.equal(Object.hasOwn(d,'theme'),false);assert.equal(d.version,'1.5.0');}
  for(const theme of [null,undefined])assert.equal(Object.hasOwn(normalizeDungeonDocument({...entityDungeon(),theme} as never),'theme'),false);
  for(const theme of [{},{sourceThemeId:'wrong',themeSnapshot:themeFixture()},{sourceThemeId:themeFixture().id,themeSnapshot:{...themeFixture(),createdAt:'bad'}}])assert.throws(()=>parseImport({...buildExportEnvelope(entityDungeon()),dungeon:{...entityDungeon(),theme}}));
});
test('partial old editor saves preserve theme while current explicit clearing persists, retaining separately saved Markdown', async()=> {
  const d=normalizeDungeonDocument({...entityDungeon(),theme:createThemeAssignment(themeFixture())});await dungeonRepository.save(d);
  await dungeonRepository.saveMarkdown(d.id,'# 別窓保存','2026-11-28T00:00:00.000Z');
  const {theme:_missing,...base}=d;await dungeonRepository.saveMainEditorSnapshot({...base,version:'1.3.0'});
  assert.deepEqual((await dungeonRepository.load(d.id))!.theme,d.theme);
  const snap=await snapshotWithSavedMarkdown(d,id=>dungeonRepository.load(id));assert.deepEqual(snap.theme,d.theme);assert.equal(snap.markdown,'# 別窓保存');
  await dungeonRepository.saveMainEditorSnapshot(base);const cleared=(await dungeonRepository.load(d.id))!;
  assert.equal(Object.hasOwn(cleared,'theme'),false);assert.equal(Object.hasOwn((await db.dungeons.get(d.id))!,'theme'),false);assert.equal(cleared.markdown,'# 別窓保存');
});
test('Theme policies are weak Piece references and do not become placed-piece deletion blockers',()=> {
  const d={...entityDungeon(),theme:createThemeAssignment(themeFixture())};d.theme.themeSnapshot.pieceSelection.includePieceIds=['only-theme-piece'];
  const refs=collectPieceReferences([d],null);assert.ok(!refs.includes('only-theme-piece'));assert.ok(refs.includes(d.rooms[0].pieceId));
});
