import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { CONTENT_KINDS } from '../src/model/content';
import { applyEntityCommand, createEntityInstance, entityDisplayName, normalizeEntities, normalizeEntity, ENTITY_LIMITS } from '../src/model/entity';
import type { EntityCommand } from '../src/model/entity';
import { contentFixture, entityDungeon } from './fixtures/entityFixture';
import { useDungeonStore } from '../src/store/dungeonStore';
import { normalizeDungeonDocument } from '../src/model/normalizeDungeon';
import { buildExportEnvelope, parseDungeonJson, parseImport } from '../src/utils/exportImport';
import { db } from '../src/db/db';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { createContentRepository } from '../src/repository/contentRepository';
import { pieceRepository } from '../src/repository/pieceRepository';
import { createConnectionSceneResolver } from '../src/editor/connectors/corridor/connectionScene';
import { snapshotWithSavedMarkdown } from '../src/publishing/publishSnapshot';

const state = () => useDungeonStore.getState();
const repository = createContentRepository(db, () => {});
const entity = () => createEntityInstance('room-0', contentFixture(), entityDungeon().rooms);
beforeEach(async () => { state().setDungeon(entityDungeon()); await db.dungeons.clear(); await db.contentDefinitions.clear(); });
after(async () => { await db.delete(); });
for (const kind of CONTENT_KINDS) test(`${kind}: factory creates an independent, GM-only grouped entity with a stable source`, () => {
  const content = contentFixture(kind), value = createEntityInstance('room-0', content, state().dungeon.rooms);
  assert.equal(value.quantity, 1); assert.equal(value.visibility, 'gm-only'); assert.equal(value.contentSnapshot.kind, kind);
  assert.equal(value.sourceContentId, content.id); assert.notEqual(value.id, entity().id);
  value.contentSnapshot.tags.push('changed'); value.contentSnapshot.attributes.hp = 12;
  assert.equal(content.tags.length, 1); assert.equal(content.attributes.hp, 7); assert.equal(entityDisplayName(value), content.name);
  assert.equal(entityDisplayName({ ...value, customName: ' 小鬼の斥候 ' }), '小鬼の斥候');
});
for (const [field, value] of [
  ['id', ''], ['roomId', 'missing'], ['sourceContentId', 'other'], ['quantity', 0], ['quantity', -1], ['quantity', 1.5],
  ['quantity', Infinity], ['quantity', ENTITY_LIMITS.quantity + 1], ['visibility', 'hidden'], ['customName', null],
  ['customName', 'x'.repeat(201)], ['publicDescription', 'x'.repeat(20001)], ['gmNotes', []], ['contentSnapshot', {}],
] as const) test(`Entity validation rejects ${field}=${String(value).slice(0, 18)}`, () => {
  assert.throws(() => normalizeEntity({ ...entity(), [field]: value }, new Set(['room-0'])));
});
test('validation rejects missing rooms, duplicate IDs, malformed arrays and oversized snapshots/room/dungeon totals', () => {
  assert.throws(() => createEntityInstance('missing', contentFixture(), state().dungeon.rooms));
  const value = entity(); assert.throws(() => normalizeEntities([value, value], state().dungeon.rooms), /重複/);
  assert.throws(() => normalizeEntities(null, state().dungeon.rooms)); assert.deepEqual(normalizeEntities(undefined, []), []);
  assert.throws(() => normalizeEntities(Array.from({ length: 501 }, () => value), state().dungeon.rooms), /500/);
  assert.throws(() => normalizeEntities(Array.from({ length: 51 }, (_, n) => ({ ...value, id: `id-${n}` })), state().dungeon.rooms), /50/);
  const huge = { ...contentFixture(), attributes: Object.fromEntries(Array.from({ length: 70 }, (_, n) => [`key-${n}`, 'x'.repeat(4000)])) };
  assert.throws(() => createEntityInstance('room-0', huge, state().dungeon.rooms), /256 KiB/);
  const big = { ...value, contentSnapshot: { ...contentFixture(), description: 'x'.repeat(100000), gmNotes: 'x'.repeat(100000) } };
  assert.throws(() => normalizeEntities(Array.from({ length: 45 }, (_, n) => ({ ...big, id: `id-${n}` })), state().dungeon.rooms), /8 MiB/);
});
test('repeated use of one definition is independent; edit/move/duplicate/delete never change the source or peers', () => {
  const rooms = state().dungeon.rooms, content = contentFixture(), before = structuredClone(content);
  let values = applyEntityCommand([], rooms, { type: 'add', roomId: 'room-0', content, quantity: 4 })!;
  values = applyEntityCommand(values, rooms, { type: 'add', roomId: 'room-0', content, quantity: 2 })!;
  const first = values[0], peer = structuredClone(values[1]);
  values = applyEntityCommand(values, rooms, { type: 'edit', id: first.id, edits: { quantity: 9, customName: '斥候', publicDescription: '公開', gmNotes: 'GM', visibility: 'public' } })!;
  assert.equal(values[0].contentSnapshot, first.contentSnapshot);
  values = applyEntityCommand(values, rooms, { type: 'duplicate', id: first.id })!;
  const copy = values[2]; assert.notEqual(copy.id, first.id); assert.notEqual(copy.contentSnapshot, values[0].contentSnapshot);
  copy.contentSnapshot.attributes.hp = 99; assert.equal(values[0].contentSnapshot.attributes.hp, 7);
  values = applyEntityCommand(values, rooms, { type: 'move', id: first.id, roomId: 'room-1' })!;
  assert.equal(values[0].contentSnapshot, first.contentSnapshot);
  assert.equal(values[0].roomId, 'room-1'); assert.equal(values[0].quantity, 9); assert.deepEqual(values[1], peer);
  assert.equal(applyEntityCommand(values, rooms, { type: 'move', id: first.id, roomId: 'room-1' }), null);
  values = applyEntityCommand(values, rooms, { type: 'delete', id: copy.id })!; assert.equal(values.length, 2); assert.deepEqual(content, before);
});
test('explicit refresh changes only the snapshot, rejects a changed kind/source and survives source deletion', async () => {
  await repository.saveMany([contentFixture()], 'skip'); const original = entity();
  const edits = { ...original, quantity: 4, customName: '守備隊', publicDescription: '聖杯', gmNotes: '警備', visibility: 'public' as const };
  const updated = await repository.save({ ...contentFixture(), name: '更新素材', attributes: { hp: 12 } }, contentFixture().updatedAt);
  assert.equal(edits.contentSnapshot.attributes.hp, 7);
  const [refreshed] = applyEntityCommand([edits], state().dungeon.rooms, { type: 'refresh', id: edits.id, content: updated })!;
  assert.deepEqual({ ...refreshed, contentSnapshot: edits.contentSnapshot }, edits); assert.equal(refreshed.contentSnapshot.attributes.hp, 12);
  assert.throws(() => applyEntityCommand([edits], state().dungeon.rooms, { type: 'refresh', id: edits.id, content: { ...updated, kind: 'npc' } }), /種別/);
  await repository.delete(updated.id, updated.updatedAt);
  assert.equal(normalizeEntities([refreshed], state().dungeon.rooms)[0].contentSnapshot.attributes.hp, 12);
});
test('all Entity commands are single undo steps; no-ops and invalid commands leave history unchanged', () => {
  const add: EntityCommand = { type: 'add', roomId: 'room-0', content: contentFixture(), quantity: 3 };
  assert.equal(state().changeEntities(add), null); const id = state().dungeon.entities[0].id;
  const operations: EntityCommand[] = [
    { type: 'edit', id, edits: { quantity: 5, customName: '固有名', gmNotes: 'GM', publicDescription: '説明', visibility: 'public' } },
    { type: 'duplicate', id }, { type: 'move', id, roomId: 'room-1' },
    { type: 'refresh', id, content: { ...contentFixture(), attributes: { hp: 15 } } }, { type: 'delete', id },
  ];
  for (const operation of operations) {
    const before = structuredClone(state().dungeon.entities), count = state().undoStack.length;
    assert.equal(state().changeEntities(operation), null); const after = structuredClone(state().dungeon.entities);
    assert.equal(state().undoStack.length, count + 1); state().undo(); assert.deepEqual(state().dungeon.entities, before);
    state().redo(); assert.deepEqual(state().dungeon.entities, after);
  }
  const count = state().undoStack.length, survivor = state().dungeon.entities[0];
  assert.equal(state().changeEntities({ type: 'move', id: survivor.id, roomId: survivor.roomId }), null);
  assert.match(state().changeEntities({ type: 'move', id: survivor.id, roomId: 'missing' })!, /部屋/);
  assert.match(state().changeEntities({ type: 'delete', id: 'missing' })!, /見つかりません/); assert.equal(state().undoStack.length, count);
});
test('Entity add/edit/history operations reuse the same routing scene, and physical edits retain entities', () => {
  const resolve = createConnectionSceneResolver(), source = state().dungeon, scene = resolve(source.rooms, source.connections);
  state().changeEntities({ type: 'add', roomId: 'room-0', content: contentFixture(), quantity: 1 });
  assert.equal(state().dungeon.rooms, source.rooms); assert.equal(state().dungeon.connections, source.connections);
  for (const action of [() => {}, () => state().undo(), () => state().redo()]) { action(); assert.equal(resolve(state().dungeon.rooms, state().dungeon.connections), scene); }
  const before = structuredClone(state().dungeon.entities);
  state().moveRoom('room-0', { x: 0, y: 3 }); state().rotateRoom('room-0');
  state().updateRoomInformation('room-0', { ...state().dungeon.rooms[0].information, number: 'A-03' });
  assert.deepEqual(state().dungeon.entities, before);
});
test('room deletion removes its entities and connections atomically, and undo restores them together', () => {
  for (const roomId of ['room-0', 'room-1']) state().changeEntities({ type: 'add', roomId, content: contentFixture(), quantity: 2 });
  const before = structuredClone(state().dungeon), count = state().undoStack.length;
  state().deleteRoom('room-0'); assert.equal(state().dungeon.entities.length, 1); assert.equal(state().dungeon.entities[0].roomId, 'room-1');
  assert.equal(state().dungeon.connections.length, 0); assert.equal(state().undoStack.length, count + 1);
  state().undo(); assert.deepEqual(state().dungeon.entities, before.entities); assert.deepEqual(state().dungeon.rooms, before.rooms); assert.deepEqual(state().dungeon.connections, before.connections);
});
test('IndexedDB reload and partial Markdown/main saves preserve entities, saved Markdown and independent libraries', async () => {
  state().changeEntities({ type: 'add', roomId: 'room-0', content: contentFixture(), quantity: 2 });
  const source = state().dungeon; await dungeonRepository.save(source);
  await dungeonRepository.saveMarkdown(source.id, '# 新しいMarkdown', new Date().toISOString());
  await dungeonRepository.saveMainEditorSnapshot({ ...source, name: '変更後' });
  const { entities: _oldMissing, ...legacySave } = source;
  await dungeonRepository.saveMainEditorSnapshot(legacySave);
  db.close(); await db.open();
  const loaded = (await dungeonRepository.load(source.id))!;
  assert.deepEqual(loaded.entities, source.entities); assert.equal(loaded.markdown, '# 新しいMarkdown');
  await assert.rejects(dungeonRepository.saveMainEditorSnapshot({ ...legacySave, rooms: legacySave.rooms.filter(r => r.id !== 'room-0') }), /所属部屋/);
  assert.deepEqual((await dungeonRepository.load(source.id))!.entities, source.entities);
  assert.equal(await db.contentDefinitions.count(), 0);
  const snapshot = await snapshotWithSavedMarkdown(source, id => dungeonRepository.load(id));
  assert.deepEqual(snapshot.entities, source.entities); assert.equal(snapshot.markdown, '# 新しいMarkdown');
  assert.notEqual(snapshot.entities, source.entities);
});
test('legacy JSON 1.0/1.1/1.2 supplements empty entities and keeps existing IDs, Markdown and room information', () => {
  const source = entityDungeon(); const { entities: _missing, ...legacy } = source;
  for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
    const result = parseImport({ formatId: 'trpg-dungeon-generator', schemaVersion: version, dungeon: { ...legacy, version } }).dungeon;
    assert.deepEqual(result.entities, []); assert.equal(result.rooms[0].id, source.rooms[0].id);
    assert.deepEqual(result.rooms[0].information, source.rooms[0].information); assert.equal(result.markdown, source.markdown);
  }
  assert.deepEqual(normalizeDungeonDocument(legacy).entities, []);
});
test('project JSON restores snapshots with no content library, keeps IDs and does not register or overwrite definitions', async () => {
  const source = entityDungeon(); source.entities = [entity()];
  const envelope = buildExportEnvelope(source); assert.equal(envelope.schemaVersion, '1.3.0');
  const restored = parseDungeonJson(JSON.stringify(envelope)).dungeon;
  assert.deepEqual(restored.entities, source.entities); await pieceRepository.registerDungeonPieces(restored);
  await dungeonRepository.save(restored); assert.equal(await db.contentDefinitions.count(), 0);
  await repository.saveMany([{ ...contentFixture(), name: 'ライブラリの新しい定義' }], 'skip');
  parseImport(envelope); assert.equal((await repository.get(contentFixture().id))!.name, 'ライブラリの新しい定義');
});
test('invalid JSON entities are rejected before any partial registration, including malformed snapshots and byte limits', async () => {
  const source = entityDungeon(); source.entities = [entity()];
  for (const invalid of [[source.entities[0], source.entities[0]], [{ ...source.entities[0], roomId: 'missing' }], [{ ...source.entities[0], contentSnapshot: {} }], [{ ...source.entities[0], quantity: 0 }]]) {
    const envelope = buildExportEnvelope(entityDungeon()); (envelope.dungeon.entities as unknown) = invalid;
    assert.throws(() => parseImport(envelope));
  }
  assert.throws(() => parseDungeonJson(' '.repeat(ENTITY_LIMITS.dungeonJsonBytes + 1)), /20 MiB/);
  assert.throws(() => parseDungeonJson('{'), /構文/);
  assert.throws(() => parseDungeonJson(JSON.stringify(buildExportEnvelope(source)).replace('"hp":7', '"hp":7,"hp":9')), /重複/);
  assert.equal(await db.contentDefinitions.count(), 0); assert.equal(await db.dungeons.count(), 0);
});
