import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from '../src/db/db';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import type { ConnectorDirection, DungeonDocument, Piece, PlacedRoom, Rotation } from '../src/model/types';
import { changePieceCell, duplicatePiece, isExteriorConnector, MAX_PIECE_SIZE, normalizePiece, pieceErrors, pieceStructure } from '../src/editor/pieces/pieceDefinition';
import { buildPieceExport, parsePieceImport } from '../src/editor/pieces/pieceJson';
import { createPieceRepository } from '../src/repository/pieceRepository';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';
import { useDungeonStore } from '../src/store/dungeonStore';
import { getWorldCells, getWorldConnectors } from '../src/utils/geometry';
import { connectionGeometry } from '../src/editor/connectors/connectionGeometry';
import { createOccupancyGrid } from '../src/editor/connectors/routing/occupancyGrid';
import { routeConnections } from '../src/editor/connectors/routing/connectionRouter';
import { prepareConnectionScene } from '../src/editor/connectors/corridor/connectionScene';
import { collectPieceReferences, pieceReferencesFrozen, registerPieceReferenceReader, withPieceLibraryRead, withPieceReferenceCheck } from '../src/editor/pieces/pieceReferences';
import { PIECE_CHANNEL, PIECE_LIBRARY_UPDATED } from '../src/editor/pieces/pieceEvents';
import { emptyRoomInformation } from '../src/model/roomInformation';

const custom = (): Piece => ({ id: 'chapel', name: '礼拝堂', shape: 'custom',
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
  connectors: [
    { id: 'entrance', position: { x: 0, y: 0 }, direction: 'north', width: 1, kind: 'door' },
    { id: 'alcove', position: { x: 0, y: 1 }, direction: 'east', width: 1, kind: 'open' },
    { id: 'exit', position: { x: 2, y: 2 }, direction: 'east', width: 1, kind: 'secret' },
  ], tags: ['room', 'temple'] });
const state = () => useDungeonStore.getState();
let live = new Set<string>();
const repository = createPieceRepository(db, async work => work(live));
const room = (id: string, piece: Piece, x = 0, y = 0, rotation: Rotation = 0): PlacedRoom =>
  ({ id, pieceId: piece.id, piece: structuredClone(piece), position: { x, y }, rotation, information: emptyRoomInformation(id) });

beforeEach(async () => { live = new Set(); state().newDungeon(); await db.pieceLibrary.clear(); await db.dungeons.clear(); });
after(async () => { await db.delete(); });

for (const p of [...DEFAULT_PIECES.slice(0, 3), custom()]) {
  test(`${p.shape}/${p.id}: cell-based definition is valid and canonical`, () => {
    assert.deepEqual(pieceErrors(p), []);
    const canonical = normalizePiece(p);
    assert.deepEqual(normalizePiece(canonical), canonical);
    assert.equal(canonical.cells.length, p.cells.length);
    assert.deepEqual(new Set(canonical.connectors.map(c => c.id)), new Set(p.connectors.map(c => c.id)));
  });
}

test('cell editing adds once, removes explicitly and removes newly invalid connectors with an explicit result', () => {
  let p = custom();
  const filled = changePieceCell(p, { x: 1, y: 1 }, true);
  assert.deepEqual(filled.removed.map(c => c.id), ['alcove']);
  assert.equal(filled.piece.cells.length, 7);
  assert.equal(changePieceCell(filled.piece, { x: 1, y: 1 }, true).piece.cells.length, 7);
  p = changePieceCell(p, { x: 2, y: 2 }, false).piece;
  assert.ok(!p.connectors.some(c => c.id === 'exit'));
  assert.equal(custom().cells.length, 6);
});

for (const [name, patch] of [
  ['empty id', { id: '' }], ['empty name', { name: ' ' }], ['empty cells', { cells: [] }],
  ['duplicate cells', { cells: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }],
  ['fractional cells', { cells: [{ x: 0.5, y: 0 }] }], ['nonfinite cells', { cells: [{ x: Infinity, y: 0 }] }],
  ['disconnected cells', { cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }],
  ['diagonal cells', { cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
  ['oversized bounds', { cells: Array.from({ length: MAX_PIECE_SIZE + 1 }, (_, x) => ({ x, y: 0 })) }],
  ['invalid tags', { tags: [1] }],
] as const) {
  test(`validation rejects ${name}`, () => { assert.throws(() => normalizePiece({ ...custom(), connectors: [], ...patch })); });
}

test('exact maximum size and connected holes are accepted', () => {
  const cells = Array.from({ length: MAX_PIECE_SIZE ** 2 }, (_, i) => ({ x: i % MAX_PIECE_SIZE, y: Math.floor(i / MAX_PIECE_SIZE) }));
  assert.equal(normalizePiece({ ...custom(), cells, connectors: [] }).cells.length, 256);
  assert.deepEqual(pieceErrors({ ...custom(), cells: cells.filter(c => !(c.x === 2 && c.y === 2)), connectors: [] }), []);
});

test('concave boundaries are exterior while occupied neighbours and absent cells are rejected', () => {
  const p = custom();
  assert.equal(isExteriorConnector(p.cells, { x: 0, y: 1 }, 'east'), true);
  assert.equal(isExteriorConnector(p.cells, { x: 0, y: 0 }, 'east'), false);
  assert.equal(isExteriorConnector(p.cells, { x: 3, y: 3 }, 'north'), false);
  for (const c of [
    { ...p.connectors[0], direction: 'east' as const }, { ...p.connectors[0], position: { x: 99, y: 99 } },
    { ...p.connectors[0], width: 2 }, { ...p.connectors[0], kind: 'bad' },
  ]) assert.throws(() => normalizePiece({ ...p, connectors: [c] }));
  assert.throws(() => normalizePiece({ ...p, connectors: [p.connectors[0], { ...p.connectors[0], id: 'another' }] }));
  assert.throws(() => normalizePiece({ ...p, connectors: [p.connectors[0], { ...p.connectors[1], id: 'entrance' }] }));
});

test('normalization translates negative cells and connectors together without changing IDs or directions', () => {
  const original = custom();
  const shifted = { ...original, cells: original.cells.map(c => ({ x: c.x - 7, y: c.y + 4 })),
    connectors: original.connectors.map(c => ({ ...c, position: { x: c.position.x - 7, y: c.position.y + 4 } })) };
  const before = structuredClone(shifted);
  assert.deepEqual(normalizePiece(shifted), normalizePiece(original));
  assert.deepEqual(shifted, before);
});

test('duplicate standard/custom templates gets a new piece ID and preserves connector-local identities', () => {
  for (const original of [DEFAULT_PIECES[0], custom()]) {
    const copy = duplicatePiece(original);
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.shape, 'custom');
    assert.deepEqual(copy.connectors.map(c => c.id).sort(), original.connectors.map(c => c.id).sort());
    assert.deepEqual(copy.cells, normalizePiece(original).cells);
  }
});

test('repository saves, lists and reloads stable identities after IndexedDB reopen', async () => {
  const saved = await repository.save(custom());
  assert.deepEqual(await repository.get(saved.id), saved);
  assert.deepEqual(await repository.list(), [saved]);
  db.close(); await db.open();
  assert.deepEqual(await repository.get(saved.id), saved);
});

test('only metadata can change after save; existing placed snapshots stay intact', async () => {
  const p = await repository.save(custom());
  state().addRoom(room('placed', p));
  await repository.save({ ...p, name: '新しい名称', tags: ['temple'] });
  assert.equal(state().dungeon.rooms[0].piece.name, '礼拝堂');
  assert.equal((await repository.get(p.id))?.name, '新しい名称');
  await assert.rejects(repository.save({ ...p, connectors: p.connectors.slice(1) }), /複製/);
  await assert.rejects(repository.save(changePieceCell(p, { x: 1, y: 1 }, true).piece), /複製/);
  await assert.rejects(repository.save(DEFAULT_PIECES[0]), /標準/);
  await assert.rejects(repository.delete(DEFAULT_PIECES[0].id), /標準/);
});

test('unused pieces delete but live/current/history/pending references refuse deletion', async () => {
  await repository.save(custom());
  live.add('chapel');
  await assert.rejects(repository.delete('chapel'), /編集中/);
  assert.ok(await repository.get('chapel'));
  live.clear(); await repository.delete('chapel');
  assert.equal(await repository.get('chapel'), undefined);
});

test('saved dungeon references and unverifiable reference data refuse deletion', async () => {
  await repository.save(custom());
  state().addRoom(room('placed', custom()));
  await dungeonRepository.save(state().dungeon);
  await assert.rejects(repository.delete('chapel'), /保存済み/);
  await db.dungeons.put({ ...state().dungeon, rooms: [{ ...state().dungeon.rooms[0], pieceId: 'mismatch' }] });
  await assert.rejects(repository.delete('chapel'), /確認できない/);
  const unavailable = createPieceRepository(db, async () => { throw new Error('no response'); });
  await assert.rejects(unavailable.delete('chapel'), /no response/);
});

test('piece JSON roundtrip preserves Piece and Connector IDs and rejects malformed formats', async () => {
  const exported = buildPieceExport(custom()), imported = parsePieceImport(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(imported, normalizePiece(custom()));
  await repository.importAll([imported]); await repository.importAll([imported]);
  assert.equal((await repository.list()).length, 1);
  await assert.rejects(repository.importAll([{ ...imported, name: 'conflict' }]), /衝突/);
  assert.throws(() => parsePieceImport({ ...exported, schemaVersion: '9.0.0' }));
  assert.throws(() => parsePieceImport({ ...exported, piece: { ...custom(), connectors: [{ ...custom().connectors[0], id: '' }] } }));
});

test('batch import rolls back earlier writes when any ID conflicts or any definition is invalid', async () => {
  await repository.save(custom());
  const another = duplicatePiece(custom(), 'another');
  await assert.rejects(repository.importAll([another, { ...custom(), name: 'conflict' }]));
  assert.equal(await repository.get('another'), undefined);
  await assert.rejects(repository.importAll([another, { ...custom(), cells: [] }]));
  assert.equal(await repository.get('another'), undefined);
});

test('custom pieces use existing world transformations and true occupied cells at all four rotations', () => {
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const placed = room('custom', custom(), 5, 7, rotation);
    const cells = getWorldCells(placed), grid = createOccupancyGrid([placed]);
    assert.equal(cells.length, 6); assert.ok(cells.every(c => grid.isOccupied(c)));
    const connectors = getWorldConnectors(placed);
    for (const c of connectors) {
      assert.ok(cells.some(cell => cell.x === c.worldPosition.x && cell.y === c.worldPosition.y));
      const directions: ConnectorDirection[] = ['north', 'east', 'south', 'west'];
      assert.equal(c.worldDirection, directions[(directions.indexOf(custom().connectors.find(local => local.id === c.id)!.direction) + rotation / 90) % 4]);
    }
  }
});

function connectedDocument(): DungeonDocument {
  state().newDungeon();
  state().addRoom(room('custom', custom(), 0, 4));
  state().addRoom(room('standard', DEFAULT_PIECES[0], 10, 5));
  assert.equal(state().addConnection({ roomId: 'custom', connectorId: 'exit' }, { roomId: 'standard', connectorId: 'piece-rect-4x4-west' }), true);
  return structuredClone(state().dungeon);
}
function derived(d: DungeonDocument) {
  const grid = createOccupancyGrid(d.rooms);
  return prepareConnectionScene(d.connections, d.rooms, routeConnections(d.connections, d.rooms, grid), grid).network;
}

test('placement, connection, obstacle routing, corridor generation and undo/redo work with custom definitions', () => {
  const d = connectedDocument();
  assert.ok(connectionGeometry(d.connections[0], d.rooms));
  const initial = derived(d); assert.ok(initial.cells.length > 0);
  state().moveRoom('custom', { x: -4, y: 8 });
  const moved = derived(state().dungeon); assert.notDeepEqual(moved, initial);
  state().rotateRoom('custom'); const rotated = derived(state().dungeon);
  state().undo(); assert.deepEqual(derived(state().dungeon), moved);
  state().redo(); assert.deepEqual(derived(state().dungeon), rotated);
  state().addRoom(room('obstacle', DEFAULT_PIECES[0], 5, 6));
  assert.ok(derived(state().dungeon).cells.every(c => !createOccupancyGrid(state().dungeon.rooms).isOccupied(c)));
});

test('dungeon JSON carries custom snapshots, registers definitions, and preserves connections across environments', async () => {
  const d = connectedDocument(), expected = derived(d);
  const imported = parseImport(JSON.parse(JSON.stringify(buildExportEnvelope(d)))).dungeon;
  assert.equal(imported.rooms[0].piece.id, 'chapel');
  await repository.registerDungeonPieces(imported);
  assert.equal((await repository.list()).length, 1);
  assert.deepEqual(await repository.get('chapel'), normalizePiece(custom()));
  assert.deepEqual(derived(imported), expected);
  assert.deepEqual(imported.connections, d.connections);
  await dungeonRepository.save(imported);
  assert.deepEqual(derived((await dungeonRepository.load(d.id))!), expected);
});

test('dungeon import validates all Piece/Connector references and rejects conflicting definitions without partial registration', async () => {
  const d = connectedDocument();
  const broken = structuredClone(d); broken.connections[0].fromConnectorId = 'missing';
  await assert.rejects(repository.registerDungeonPieces(broken));
  assert.equal((await repository.list()).length, 0);
  broken.connections = d.connections; broken.rooms[0].pieceId = 'missing';
  await assert.rejects(repository.registerDungeonPieces(broken));
  const two = structuredClone(d); two.rooms.push(room('another', duplicatePiece(custom(), 'another'), -10, 0));
  await repository.save({ ...custom(), connectors: custom().connectors.slice(1) });
  await assert.rejects(repository.registerDungeonPieces(two), /衝突/);
  assert.equal(await repository.get('another'), undefined);
});

test('metadata differences in old placed snapshots reuse the existing immutable definition without overwriting it', async () => {
  await repository.save({ ...custom(), name: '最新版' });
  const d = connectedDocument(); await repository.registerDungeonPieces(d);
  assert.equal((await repository.get('chapel'))?.name, '最新版');
  assert.equal(d.rooms[0].piece.name, '礼拝堂');
  assert.equal(pieceStructure(d.rooms[0].piece), pieceStructure((await repository.get('chapel'))!));
});

test('old dungeon 1.0/1.1 JSON remains readable and standard identities cannot be impersonated', () => {
  const d = connectedDocument(); d.rooms = d.rooms.slice(1); d.connections = [];
  const envelope = buildExportEnvelope(d);
  assert.equal(parseImport({ ...envelope, schemaVersion: '1.0.0', dungeon: { ...d, connections: undefined } }).dungeon.rooms[0].pieceId, DEFAULT_PIECES[0].id);
  const forged = structuredClone(envelope); forged.dungeon.rooms[0].piece.connectors = [];
  assert.throws(() => parseImport(forged), /standard piece/);
});

test('reference collection includes current rooms, undo/redo and pending placement', () => {
  state().addRoom(room('placed', custom())); state().deleteRoom('placed');
  const collect = () => collectPieceReferences([state().dungeon, ...state().undoStack, ...state().redoStack], state().pendingPiece);
  assert.ok(collect().includes('chapel'));
  state().undo(); state().undo(); assert.ok(collect().includes('chapel'));
  state().newDungeon(); assert.deepEqual(collect(), []);
  state().setPendingPiece(custom()); assert.deepEqual(collect(), ['chapel']);
});

test('live windows exchange references and pause placement/load/history until the check releases its lock',
  { skip: typeof navigator === 'undefined' || !navigator.locks }, async () => {
  const stopA = await registerPieceReferenceReader(() => ['from-window-a']);
  const stopB = await registerPieceReferenceReader(() => ['from-window-b']);
  try {
    await withPieceReferenceCheck(async ids => {
      assert.deepEqual([...ids].sort(), ['from-window-a', 'from-window-b']);
      assert.equal(pieceReferencesFrozen(), true);
      state().addRoom(room('blocked', custom())); assert.equal(state().dungeon.rooms.length, 0);
      state().setPendingPiece(custom()); assert.equal(state().pendingPiece, null);
      assert.throws(() => state().setDungeon(state().dungeon), /参照確認中/);
    });
    await withPieceLibraryRead(async () => { assert.equal(pieceReferencesFrozen(), false); });
    state().addRoom(room('unblocked', custom())); assert.equal(state().dungeon.rooms.length, 1);
  } finally { stopA(); stopB(); }
});

test('missing live-window responses deny deletion and release the integrity lock',
  { skip: typeof navigator === 'undefined' || !navigator.locks }, async () => {
  let release!: () => void;
  const lifetime = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(ready => {
    void navigator.locks.request('trpg-dungeon-editor-session:unresponsive', async () => { ready(); await lifetime; });
  });
  await held;
  try { await assert.rejects(withPieceReferenceCheck(async () => { assert.fail('must not authorize deletion'); }), /応答がありません/); }
  finally { release(); }
  await withPieceLibraryRead(async () => { assert.equal(pieceReferencesFrozen(), false); });
});

test('library update notification arrives only after the saved definition can be read', async () => {
  const channel = new BroadcastChannel(PIECE_CHANNEL);
  try {
    const received = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('missing library update')), 2500);
      channel.onmessage = event => {
        if (event.data?.type !== PIECE_LIBRARY_UPDATED) return;
        void repository.get('chapel').then(p => { clearTimeout(timer); assert.ok(p); resolve(); }).catch(reject);
      };
    });
    await repository.save(custom()); await received;
  } finally { channel.close(); }
});
