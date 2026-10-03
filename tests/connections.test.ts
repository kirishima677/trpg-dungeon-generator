import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { useDungeonStore } from '../src/store/dungeonStore';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { normalizeDungeonDocument } from '../src/model/normalizeDungeon';
import { connectionEndpoints } from '../src/editor/connectors/connectionGeometry';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';
import type { ConnectorEndpoint, DungeonDocument, PlacedRoom, Rotation } from '../src/model/types';

const piece = DEFAULT_PIECES[0];
function room(id: string, x = 0, y = 0): PlacedRoom {
  return { id, pieceId: piece.id, piece, position: { x, y }, rotation: 0 };
}
const a: ConnectorEndpoint = { roomId: 'a', connectorId: piece.connectors[2].id };
const b: ConnectorEndpoint = { roomId: 'b', connectorId: piece.connectors[3].id };
const state = () => useDungeonStore.getState();
function connect() {
  assert.equal(state().addConnection(a, b), true);
  return state().dungeon.connections[0];
}

beforeEach(() => {
  state().newDungeon();
  state().addRoom(room('a', 1, 2));
  state().addRoom(room('b', 10, 2));
});
after(async () => { await db.delete(); });

test('two clicks create a logical connection and clear the selected endpoint', () => {
  state().setEditorMode('connect');
  state().chooseConnector(a);
  assert.deepEqual(state().pendingConnector, a);
  assert.equal(state().dungeon.connections.length, 0);
  state().chooseConnector(b);
  assert.equal(state().dungeon.connections.length, 1);
  assert.equal(state().pendingConnector, null);
  assert.deepEqual(Object.keys(state().dungeon.connections[0]).sort(),
    ['id', 'fromRoomId', 'fromConnectorId', 'toRoomId', 'toConnectorId', 'type'].sort());
});

test('guards reject self, same-room, occupied and nonexistent endpoints without history', () => {
  const undoCount = state().undoStack.length;
  assert.equal(state().addConnection(a, a), false);
  assert.equal(state().addConnection(a, { roomId: 'a', connectorId: piece.connectors[0].id }), false);
  assert.equal(state().addConnection(a, { roomId: 'missing', connectorId: b.connectorId }), false);
  assert.equal(state().addConnection(a, { roomId: 'b', connectorId: 'missing' }), false);
  assert.equal(state().undoStack.length, undoCount);
  connect();
  assert.equal(state().addConnection(a, b), false);
  assert.equal(state().addConnection(b, a), false);
  assert.equal(state().addConnection(a, { roomId: 'b', connectorId: piece.connectors[0].id }), false);
  assert.equal(state().undoStack.length, undoCount + 1);
});

test('manual connection permits distant endpoints facing the same direction', () => {
  assert.equal(state().addConnection(a, { roomId: 'b', connectorId: a.connectorId }, 'stairs'), true);
  assert.equal(state().dungeon.connections[0].type, 'stairs');
});

test('selection cancels on second click, mode switch, undo, load and new dungeon', () => {
  state().setEditorMode('connect');
  state().chooseConnector(a);
  state().chooseConnector(a);
  assert.equal(state().pendingConnector, null);
  state().chooseConnector(a);
  state().setEditorMode('select');
  assert.equal(state().pendingConnector, null);
  state().setEditorMode('connect');
  state().chooseConnector(a);
  state().undo();
  assert.equal(state().pendingConnector, null);
  state().redo();
  state().chooseConnector(a);
  state().setDungeon(state().dungeon);
  assert.equal(state().pendingConnector, null);
  assert.equal(state().editorMode, 'select');
  state().setEditorMode('connect');
  state().chooseConnector(a);
  state().newDungeon();
  assert.equal(state().pendingConnector, null);
});

test('moving a room recalculates endpoints without modifying the connection', () => {
  const connection = connect();
  assert.deepEqual(connectionEndpoints(connection, state().dungeon.rooms),
    { from: { x: 5, y: 3.5 }, to: { x: 10, y: 3.5 } });
  state().moveRoom('b', { x: 12, y: 8 });
  assert.deepEqual(connectionEndpoints(connection, state().dungeon.rooms),
    { from: { x: 5, y: 3.5 }, to: { x: 12, y: 9.5 } });
  assert.deepEqual(state().dungeon.connections[0], connection);
  state().undo();
  assert.deepEqual(connectionEndpoints(connection, state().dungeon.rooms)?.to, { x: 10, y: 3.5 });
  state().redo();
  assert.deepEqual(connectionEndpoints(connection, state().dungeon.rooms)?.to, { x: 12, y: 9.5 });
});

test('all four rotations recalculate both local position and outward direction', () => {
  const connection = connect();
  const expected = [{ x: 5, y: 3.5 }, { x: 3.5, y: 6 }, { x: 1, y: 4.5 }, { x: 2.5, y: 2 }];
  for (const point of expected) {
    assert.deepEqual(connectionEndpoints(connection, state().dungeon.rooms)?.from, point);
    state().rotateRoom('a');
    assert.deepEqual(state().dungeon.connections[0], connection);
  }
});

test('rotation uses the rotated bounding box of non-square pieces', () => {
  const rectangular = DEFAULT_PIECES[1];
  const rectangularRoom = { ...room('rect', 3, 4), piece: rectangular, pieceId: rectangular.id };
  const c = { ...connect(), fromRoomId: 'rect', fromConnectorId: rectangular.connectors[0].id };
  const expected = [{ x: 5.5, y: 4 }, { x: 6, y: 6.5 }, { x: 6.5, y: 7 }, { x: 3, y: 7.5 }];
  ([0, 90, 180, 270] as Rotation[]).forEach((rotation, index) => {
    assert.deepEqual(connectionEndpoints(c, [{ ...rectangularRoom, rotation }, room('b', 20)])?.from, expected[index]);
  });
});

test('connection creation and deletion undo/redo, and branching clears redo', () => {
  const c = connect();
  state().undo();
  assert.equal(state().dungeon.connections.length, 0);
  state().redo();
  assert.deepEqual(state().dungeon.connections, [c]);
  state().deleteConnection(c.id);
  assert.equal(state().dungeon.connections.length, 0);
  state().undo();
  assert.deepEqual(state().dungeon.connections, [c]);
  state().redo();
  assert.equal(state().dungeon.connections.length, 0);
  state().undo();
  state().moveRoom('b', { x: 14, y: 0 });
  assert.equal(state().redoStack.length, 0);
});

test('deleting a room deletes its links atomically and undo restores both', () => {
  const c = connect();
  state().deleteRoom('a');
  assert.equal(state().dungeon.rooms.length, 1);
  assert.equal(state().dungeon.connections.length, 0);
  state().undo();
  assert.equal(state().dungeon.rooms.length, 2);
  assert.deepEqual(state().dungeon.connections, [c]);
  state().redo();
  assert.equal(state().dungeon.connections.length, 0);
});

test('occupied endpoint becomes available again after connection deletion', () => {
  const c = connect();
  state().setEditorMode('connect');
  state().chooseConnector(a);
  assert.equal(state().pendingConnector, null);
  state().deleteConnection(c.id);
  state().chooseConnector(a);
  state().chooseConnector(b);
  assert.equal(state().dungeon.connections.length, 1);
});

test('old documents without connections or markdown still load', () => {
  const { connections: _connections, markdown: _markdown, ...old } = state().dungeon;
  state().setDungeon(old);
  assert.deepEqual(state().dungeon.connections, []);
  assert.equal(state().dungeon.markdown, '');
});

test('legacy reciprocal room maps migrate once and disappear from saved data', () => {
  const { connections: _connections, ...old } = state().dungeon;
  const legacy = {
    ...old,
    rooms: old.rooms.map(r => ({ ...r, connections: r.id === 'a'
      ? { [a.connectorId]: b } : { [b.connectorId]: a } })),
  };
  const migrated = normalizeDungeonDocument(legacy);
  assert.equal(migrated.connections.length, 1);
  assert.ok(migrated.rooms.every(r => !('connections' in r)));
  assert.deepEqual(normalizeDungeonDocument(migrated), migrated);
  assert.deepEqual(normalizeDungeonDocument({ ...legacy, connections: [] }).connections, []);
});

test('export/import roundtrip preserves connections, types and calculated geometry', () => {
  state().addConnection(a, b, 'secret');
  state().moveRoom('b', { x: 12, y: 8 });
  state().rotateRoom('a');
  const before = state().dungeon;
  const envelope = buildExportEnvelope(before);
  assert.equal(envelope.schemaVersion, '1.1.0');
  const imported = parseImport(JSON.parse(JSON.stringify(envelope))).dungeon;
  state().setDungeon(imported);
  assert.deepEqual(state().dungeon.connections, before.connections);
  assert.deepEqual(connectionEndpoints(imported.connections[0], imported.rooms),
    connectionEndpoints(before.connections[0], before.rooms));
  assert.ok(imported.rooms.every(r => !('connections' in r)));
});

test('old schema imports normalize missing connections', () => {
  const { connections: _connections, ...old } = state().dungeon;
  const envelope = { ...buildExportEnvelope(state().dungeon), schemaVersion: '1.0.0', dungeon: old };
  assert.deepEqual(parseImport(envelope).dungeon.connections, []);
});

test('imports reject dangling, duplicate, self connections and unsupported types', () => {
  const c = connect();
  const envelope = buildExportEnvelope(state().dungeon);
  for (const connections of [
    [c, { ...c, id: 'duplicate' }],
    [{ ...c, toRoomId: 'missing' }],
    [{ ...c, toConnectorId: 'missing' }],
    [{ ...c, toRoomId: 'a' }],
    [{ ...c, type: 'invalid' }],
  ]) {
    assert.throws(() => parseImport({ ...envelope, dungeon: { ...envelope.dungeon, connections } }), /Invalid connections/);
  }
  assert.throws(() => parseImport({ ...envelope, schemaVersion: '99.0.0' }), /Unsupported/);
});

test('IndexedDB saves, updates and reloads connections without overwriting Markdown', async () => {
  const c = connect();
  const initial = state().dungeon;
  await dungeonRepository.saveMainEditorSnapshot(initial); // insert path
  assert.deepEqual((await dungeonRepository.load(initial.id))?.connections, [c]);
  await dungeonRepository.saveMarkdown(initial.id, '# Separate editor', new Date().toISOString());
  state().moveRoom('b', { x: 15, y: 10 });
  const updated = state().dungeon;
  await dungeonRepository.saveMainEditorSnapshot(updated); // update path
  const loaded = await dungeonRepository.load(initial.id);
  assert.ok(loaded);
  assert.equal(loaded.markdown, '# Separate editor');
  assert.deepEqual(loaded.connections, [c]);
  assert.equal(loaded.updatedAt, updated.updatedAt);
  assert.deepEqual(loaded.rooms.find(r => r.id === 'b')?.position, { x: 15, y: 10 });
  assert.equal((await dungeonRepository.list()).find(d => d.id === initial.id)?.connections.length, 1);
  state().deleteConnection(c.id);
  await dungeonRepository.saveMainEditorSnapshot(state().dungeon);
  assert.deepEqual((await dungeonRepository.load(initial.id))?.connections, []);
});

test('IndexedDB load normalizes documents written by the old editor', async () => {
  const { connections: _connections, markdown: _markdown, ...legacy } = state().dungeon;
  // Simulate a pre-migration record, not a new repository write.
  await db.dungeons.put(legacy as DungeonDocument);
  assert.deepEqual((await dungeonRepository.load(legacy.id))?.connections, []);
  assert.equal((await dungeonRepository.load(legacy.id))?.markdown, '');
});
