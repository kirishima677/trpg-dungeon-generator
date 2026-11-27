import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DungeonDocument, Piece, PlacedRoom, PlacedRoomInput, RoomInformation, Rotation } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { normalizeDungeonDocument } from '../src/model/normalizeDungeon';
import { emptyRoomInformation, nextRoomNumber, normalizeRoomInformationList, normalizeRoomTags, roomDisplayName, roomInformationError } from '../src/model/roomInformation';
import { useDungeonStore } from '../src/store/dungeonStore';
import { getWorldCells } from '../src/utils/geometry';
import { buildExportEnvelope, FORMAT_ID, parseImport, SCHEMA_VERSION } from '../src/utils/exportImport';
import { roomLabelLayout } from '../src/editor/rooms/roomLabel';
import { RoomLabel } from '../src/components/pieces/RoomLabel';
import { RoomInformationForm } from '../src/components/ui/RoomInformationForm';
import { createConnectionSceneResolver } from '../src/editor/connectors/corridor/connectionScene';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { pieceRepository } from '../src/repository/pieceRepository';
import { buildPieceExport } from '../src/editor/pieces/pieceJson';
import { db } from '../src/db/db';

const state = () => useDungeonStore.getState();
const room = (id: string, x = 0, y = 0, piece = DEFAULT_PIECES[0]): PlacedRoomInput => ({ id, pieceId: piece.id, piece, position: { x, y }, rotation: 0 });
const currentRoom = (id = 'a') => state().dungeon.rooms.find(r => r.id === id)!;
function setup() {
  state().addRoom(room('a'));
  state().addRoom(room('b', 12));
}
const info = (patch: Partial<RoomInformation> = {}): RoomInformation => ({ number: 'A-01', name: '古い礼拝堂',
  description: '# 礼拝堂\n\n朽ちた祭壇がある。', gmNotes: '## 秘密\n祭壇の下に隠し階段。', tags: ['temple', 'undead'], ...patch });
const numbers = () => state().dungeon.rooms.map(r => r.information.number);
function connect() {
  assert.equal(state().addConnection({ roomId: 'a', connectorId: 'piece-rect-4x4-east' }, { roomId: 'b', connectorId: 'piece-rect-4x4-west' }), true);
}

beforeEach(async () => { state().newDungeon(); state().setRoomLabels({ numbers: true, names: true }); await db.dungeons.clear(); await db.pieceLibrary.clear(); });
after(async () => { await db.delete(); });

test('new placement numbers every placed piece, including manual corridors, without renumbering on deletion', () => {
  setup(); state().addRoom(room('manual', 0, 8, DEFAULT_PIECES[3]));
  assert.deepEqual(numbers(), ['01', '02', '03']);
  state().deleteRoom('b'); assert.deepEqual(numbers(), ['01', '03']);
  state().addRoom(room('next', 12)); assert.deepEqual(numbers(), ['01', '03', '04']);
  const before = state().dungeon;
  state().addRoom(room('next', 30)); assert.equal(state().dungeon, before);
});

for (const [values, expected] of [
  [[], '01'], [['01', '09', 'A-99'], '10'], [['99'], '100'], [['A-01', 'B1-05'], '01'],
  [['9007199254740993'], '9007199254740994'], [['00', '0008'], '09'],
] as [string[], string][]) {
  test(`auto numbering ${JSON.stringify(values)} -> ${expected}`, () => { assert.equal(nextRoomNumber(values), expected); });
}

test('manual string labels are trimmed and IDs/connection references do not change', () => {
  setup(); connect();
  const before = structuredClone(state().dungeon.connections), piece = currentRoom().piece;
  assert.equal(state().updateRoomInformation('a', info({ number: ' B1-05 ' })), null);
  assert.equal(currentRoom().information.number, 'B1-05');
  assert.equal(currentRoom().id, 'a'); assert.equal(currentRoom().piece, piece);
  assert.deepEqual(state().dungeon.connections, before);
  state().addRoom(room('c', 24)); assert.equal(currentRoom('c').information.number, '03');
});

test('duplicate and blank number edits keep the existing number and add no history', () => {
  setup(); const before = state().dungeon, count = state().undoStack.length;
  for (const number of ['02', ' 02 ', '', ' \n\t ']) {
    assert.ok(state().updateRoomInformation('a', info({ number })));
    assert.equal(state().dungeon, before); assert.equal(state().undoStack.length, count);
    assert.equal(currentRoom().information.number, '01');
  }
  assert.ok(state().updateRoomInformation('missing', info()));
});

test('scenario fields and room tags belong to one room and never modify shared Piece definitions', () => {
  setup(); const pieceBefore = structuredClone(DEFAULT_PIECES[0]), other = structuredClone(currentRoom('b'));
  const value = info({ tags: [' temple ', '', 'undead', 'temple', ' undead '] });
  assert.equal(state().updateRoomInformation('a', value), null);
  assert.deepEqual(currentRoom().information, info());
  value.tags.push('mutated'); assert.deepEqual(currentRoom().information.tags, ['temple', 'undead']);
  assert.deepEqual(currentRoom('b'), other); assert.deepEqual(DEFAULT_PIECES[0], pieceBefore);
  assert.deepEqual(normalizeRoomTags([' a ', 'a', ' A', '']), ['a', 'A']);
  assert.equal(roomDisplayName(currentRoom()), '古い礼拝堂');
  assert.equal(roomDisplayName(currentRoom('b')), DEFAULT_PIECES[0].name);
});

test('applying all fields produces one undo step and unchanged data produces none', () => {
  setup(); const count = state().undoStack.length, original = structuredClone(currentRoom().information);
  state().updateRoomInformation('a', info()); assert.equal(state().undoStack.length, count + 1);
  state().updateRoomInformation('a', info()); assert.equal(state().undoStack.length, count + 1);
  state().undo(); assert.deepEqual(currentRoom().information, original);
  state().redo(); assert.deepEqual(currentRoom().information, info());
});

test('moving and all rotations preserve room metadata and logical connections', () => {
  setup(); connect(); state().updateRoomInformation('a', info());
  const connection = structuredClone(state().dungeon.connections);
  state().moveRoom('a', { x: -8, y: -4 });
  for (let i = 0; i < 4; i++) {
    state().rotateRoom('a'); assert.deepEqual(currentRoom().information, info());
    assert.deepEqual(state().dungeon.connections, connection);
  }
});

test('room deletion removes its information and connections while preserving other numbers and templates', () => {
  setup(); connect(); state().updateRoomInformation('a', info());
  const other = structuredClone(currentRoom('b')), piece = structuredClone(DEFAULT_PIECES[0]);
  state().deleteRoom('a'); assert.equal(state().dungeon.rooms.length, 1);
  assert.equal(state().dungeon.connections.length, 0); assert.deepEqual(currentRoom('b'), other);
  assert.deepEqual(DEFAULT_PIECES[0], piece);
  state().undo(); assert.deepEqual(currentRoom().information, info()); assert.equal(state().dungeon.connections.length, 1);
  state().redo(); assert.equal(state().dungeon.rooms.length, 1);
});

for (const [showNumbers, showNames] of [[true, true], [true, false], [false, true], [false, false]]) {
  test(`canvas number/name visibility ${showNumbers}/${showNames} stays outside saved data`, () => {
    setup(); state().updateRoomInformation('a', info());
    const placed = currentRoom(), before = state().dungeon, count = state().undoStack.length;
    state().setRoomLabels({ numbers: showNumbers, names: showNames });
    const markup = renderToStaticMarkup(createElement(RoomLabel, { room: placed, cells: getWorldCells(placed), visibility: state().roomLabels, color: '#475569' }));
    assert.equal(markup.includes('data-room-number='), showNumbers);
    assert.equal(markup.includes('data-room-name='), showNames);
    assert.equal(state().dungeon, before); assert.equal(state().undoStack.length, count);
    assert.doesNotMatch(JSON.stringify(buildExportEnvelope(before)), /roomLabels|showRoomNumbers/);
    assert.ok(!markup.includes('隠し階段'));
  });
}

test('label anchors remain on occupied cells for rectangles, L shapes and custom holes at all four rotations', () => {
  const ring: Piece = { id: 'ring', name: '輪', shape: 'custom', connectors: [], cells: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ] };
  for (const piece of [DEFAULT_PIECES[0], DEFAULT_PIECES[1], DEFAULT_PIECES[2], ring]) {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const placed: PlacedRoom = { ...room('r', -8, 9, piece), rotation, information: info() };
      const cells = getWorldCells(placed), anchor = roomLabelLayout(cells)!;
      assert.ok(cells.some(c => c.x === Math.floor(anchor.x) && c.y === Math.floor(anchor.y)));
      assert.deepEqual(roomLabelLayout([...cells].reverse()), anchor);
      const markup = renderToStaticMarkup(createElement(RoomLabel, { room: placed, cells, visibility: { numbers: true, names: true }, color: 'black' }));
      assert.doesNotMatch(markup, /rotate\(/);
      assert.match(markup, /pointer-events="none"/);
      assert.ok(anchor.width >= 1);
    }
  }
  assert.equal(roomLabelLayout([]), null);
});

test('label positions translate with the room and unsafe-looking text remains plain SVG/text input', () => {
  const placed: PlacedRoom = { ...room('r'), information: info({ name: '<script>alert(1)</script>' }) };
  const a = roomLabelLayout(getWorldCells(placed))!;
  const b = roomLabelLayout(getWorldCells({ ...placed, position: { x: 6, y: -3 } }))!;
  assert.equal(b.x - a.x, 6); assert.equal(b.y - a.y, -3);
  const markup = renderToStaticMarkup(createElement(RoomLabel, { room: placed, cells: getWorldCells(placed), visibility: { numbers: true, names: true }, color: 'black' }));
  assert.doesNotMatch(markup, /<script/); assert.match(markup, /&lt;script&gt;/);
  const form = renderToStaticMarkup(createElement(RoomInformationForm, { room: placed }));
  assert.match(form, /公開説明/); assert.match(form, /GM専用情報/); assert.match(form, /部屋情報を適用/);
  assert.doesNotMatch(form, /<script/);
});

test('legacy migration reserves existing labels before filling gaps and is deterministic without mutating input', () => {
  const rooms = [room('a'), { ...room('b', 10), information: emptyRoomInformation('01') },
    { ...room('c', 20), information: info({ number: ' A-01 ' }) },
    { ...room('d', 30), information: emptyRoomInformation('01') },
    { ...room('e', 40), information: emptyRoomInformation('05') }];
  const before = structuredClone(rooms), migrated = normalizeRoomInformationList(rooms);
  assert.deepEqual(migrated.map(r => r.information.number), ['06', '01', 'A-01', '07', '05']);
  assert.deepEqual(normalizeRoomInformationList(migrated), migrated);
  assert.deepEqual(normalizeRoomInformationList(rooms), migrated); assert.deepEqual(rooms, before);
  assert.deepEqual(migrated.map(r => [r.id, r.pieceId, r.piece.connectors.map(c => c.id)]), rooms.map(r => [r.id, r.pieceId, r.piece.connectors.map(c => c.id)]));
});

test('legacy missing/invalid fields receive empty defaults and independent tag arrays', () => {
  const migrated = normalizeRoomInformationList([room('a'), room('b')]);
  assert.deepEqual(migrated[0].information, emptyRoomInformation('01'));
  assert.deepEqual(migrated[1].information, emptyRoomInformation('02'));
  migrated[0].information.tags.push('x'); assert.deepEqual(migrated[1].information.tags, []);
  const partial = { ...room('c'), information: { number: '05', name: 3, description: null, tags: [' temple ', 1, 'temple'] } };
  const repaired = normalizeRoomInformationList([partial as unknown as PlacedRoomInput]);
  assert.deepEqual(repaired[0].information, { ...emptyRoomInformation('05'), tags: ['temple'] });
});

test('IndexedDB legacy read, update and repeated load preserve stable numbers and information', async () => {
  const legacy = { ...state().dungeon, version: '1.1.0', rooms: [room('a'), room('b', 12)] };
  await db.dungeons.put(legacy as DungeonDocument);
  const first = (await dungeonRepository.load(legacy.id))!, second = (await dungeonRepository.load(legacy.id))!;
  assert.equal(first.version, SCHEMA_VERSION); assert.deepEqual(first, second);
  assert.deepEqual(first.rooms.map(r => r.information.number), ['01', '02']);
  state().setDungeon(first); state().updateRoomInformation('a', info());
  await dungeonRepository.saveMainEditorSnapshot(state().dungeon);
  const loaded = (await dungeonRepository.load(legacy.id))!;
  assert.deepEqual(loaded.rooms[0].information, info()); assert.equal(loaded.rooms[1].information.number, '02');
});

test('new JSON roundtrip includes public and GM information without view or generated corridor data', () => {
  setup(); connect(); state().updateRoomInformation('a', info());
  const before = structuredClone(state().dungeon), envelope = buildExportEnvelope(before);
  assert.equal(envelope.schemaVersion, '1.3.0');
  const imported = parseImport(JSON.parse(JSON.stringify(envelope))).dungeon;
  assert.deepEqual(imported, before); assert.deepEqual(imported.rooms[0].information, info());
  assert.doesNotMatch(JSON.stringify(envelope), /sourceConnectionIds|roomLabels|openConnectorIds/);
});

for (const schemaVersion of ['1.0.0', '1.1.0']) {
  test(`old JSON ${schemaVersion} supplies room defaults without replacing IDs or existing valid information`, () => {
    setup(); connect(); const before = structuredClone(state().dungeon);
    const legacy = { ...before, version: schemaVersion, rooms: before.rooms.map(({ information: _info, ...r }) => r) };
    const imported = parseImport({ formatId: FORMAT_ID, schemaVersion, dungeon: legacy }).dungeon;
    assert.deepEqual(imported.rooms.map(r => r.information), [emptyRoomInformation('01'), emptyRoomInformation('02')]);
    assert.deepEqual(imported.connections, before.connections);
    assert.deepEqual(imported.rooms.map(r => r.id), before.rooms.map(r => r.id));
    assert.deepEqual(normalizeDungeonDocument(legacy), imported);
  });
}

test('new JSON rejects missing, blank, duplicate and incorrectly typed room information', () => {
  setup(); const before = buildExportEnvelope(state().dungeon);
  for (const patch of [undefined, null, { ...info(), number: '' }, { ...info(), number: 1 },
    { ...info(), name: 3 }, { ...info(), description: null }, { ...info(), gmNotes: [] }, { ...info(), tags: [1] }]) {
    const raw = structuredClone(before);
    raw.dungeon.rooms[0].information = patch as RoomInformation;
    assert.throws(() => parseImport(raw), /room information/);
  }
  const duplicate = structuredClone(before); duplicate.dungeon.rooms[1].information.number = ' 01 ';
  assert.throws(() => parseImport(duplicate), /room information/);
  assert.ok(roomInformationError({ ...info(), tags: {} }));
});

test('invalid room information cannot leave partially registered custom pieces', async () => {
  const custom: Piece = { ...structuredClone(DEFAULT_PIECES[0]), id: 'custom', shape: 'custom' };
  const doc = normalizeDungeonDocument({ ...state().dungeon, rooms: [room('a', 0, 0, custom), room('b', 10, 0, custom)] });
  const before = structuredClone(state().dungeon);
  doc.rooms[1].information.number = '01';
  await assert.rejects(pieceRepository.registerDungeonPieces(doc), /room information/);
  assert.equal(await db.pieceLibrary.count(), 0); assert.deepEqual(state().dungeon, before);
});

test('custom templates and their piece JSON stay independent of room information across dungeon import', async () => {
  const custom: Piece = { ...structuredClone(DEFAULT_PIECES[0]), id: 'custom', shape: 'custom', tags: ['material'] };
  state().addRoom(room('a', 0, 0, custom)); state().updateRoomInformation('a', info());
  const imported = parseImport(JSON.parse(JSON.stringify(buildExportEnvelope(state().dungeon)))).dungeon;
  await pieceRepository.registerDungeonPieces(imported);
  assert.deepEqual(imported.rooms[0].information, info());
  const stored = (await pieceRepository.get('custom'))!;
  assert.deepEqual(stored.tags, ['material']); assert.doesNotMatch(JSON.stringify(buildPieceExport(stored)), /information|隠し階段/);
});

test('Markdown saves and stale main-editor saves update separate fields without losing room information', async () => {
  setup(); state().updateRoomInformation('a', info());
  const initial = { ...state().dungeon, markdown: '# Original' };
  await dungeonRepository.save(initial);
  state().updateRoomInformation('a', info({ name: '宝物庫' }));
  await Promise.all([
    dungeonRepository.saveMarkdown(initial.id, '# Latest global scenario', new Date().toISOString()),
    dungeonRepository.saveMainEditorSnapshot({ ...state().dungeon, markdown: '# stale' }),
  ]);
  const loaded = (await dungeonRepository.load(initial.id))!;
  assert.equal(loaded.markdown, '# Latest global scenario');
  assert.equal(loaded.rooms[0].information.name, '宝物庫');
  await dungeonRepository.saveMarkdown(initial.id, '# Updated again', new Date().toISOString());
  assert.deepEqual((await dungeonRepository.load(initial.id))!.rooms, loaded.rooms);
});

test('room undo/redo preserves the latest separately edited dungeon Markdown', () => {
  setup(); state().updateRoomInformation('a', info());
  useDungeonStore.setState(s => ({ dungeon: { ...s.dungeon, markdown: '# Updated by Markdown window' } }));
  state().undo(); assert.equal(currentRoom().information.name, ''); assert.equal(state().dungeon.markdown, '# Updated by Markdown window');
  state().redo(); assert.equal(currentRoom().information.name, '古い礼拝堂'); assert.equal(state().dungeon.markdown, '# Updated by Markdown window');
});

test('information edits, undo/redo and display changes reuse the complete physical scene without recomputation', () => {
  setup(); connect(); const resolve = createConnectionSceneResolver();
  const getScene = () => resolve(state().dungeon.rooms, state().dungeon.connections);
  const initial = getScene(); assert.ok(initial.network.cells.length > 0);
  state().updateRoomInformation('a', info()); assert.equal(getScene(), initial);
  state().undo(); assert.equal(getScene(), initial);
  state().redo(); assert.equal(getScene(), initial);
  state().setRoomLabels({ names: false }); assert.equal(getScene(), initial);
  const cloned = structuredClone(state().dungeon); cloned.rooms[0].piece.name = 'Metadata only';
  assert.equal(resolve(cloned.rooms, cloned.connections), initial);
  state().moveRoom('b', { x: 12, y: 6 }); assert.notEqual(getScene(), initial);
  const moved = getScene(); state().rotateRoom('b'); assert.notEqual(getScene(), moved);
});

test('automatic corridor cells never receive room information or numbers', () => {
  setup(); connect(); const resolve = createConnectionSceneResolver();
  const scene = resolve(state().dungeon.rooms, state().dungeon.connections);
  assert.ok(scene.network.cells.length > 0);
  assert.doesNotMatch(JSON.stringify(scene.network.cells), /information|number|gmNotes/);
  assert.equal(state().dungeon.rooms.length, 2); assert.deepEqual(numbers(), ['01', '02']);
});
