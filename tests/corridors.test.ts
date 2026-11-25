import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import type { Connection, DungeonDocument, Piece, PlacedRoom, Rotation } from '../src/model/types';
import { connectionGeometry } from '../src/editor/connectors/connectionGeometry';
import type { ConnectionGeometry } from '../src/editor/connectors/connectionGeometry';
import { createOccupancyGrid, SparseOccupancyGrid } from '../src/editor/connectors/routing/occupancyGrid';
import { routeConnections } from '../src/editor/connectors/routing/connectionRouter';
import { isCellCenteredRoute } from '../src/editor/connectors/routing/routeUtils';
import type { ConnectionRoute } from '../src/editor/connectors/routing/types';
import { generateCorridorCells, MAX_CORRIDOR_CELLS } from '../src/editor/connectors/corridor/corridorGeometry';
import type { CorridorCell } from '../src/editor/connectors/corridor/corridorGeometry';
import { EAST, NORTH, SOUTH, WEST } from '../src/editor/connectors/corridor/directions';
import { corridorWalls } from '../src/editor/connectors/corridor/corridorShape';
import { MAX_TOTAL_CORRIDOR_CELLS, prepareConnectionScene } from '../src/editor/connectors/corridor/connectionScene';
import type { ConnectionScene } from '../src/editor/connectors/corridor/connectionScene';
import { CorridorRenderer } from '../src/components/connections/CorridorRenderer';
import { ConnectionRenderer } from '../src/components/connections/ConnectionRenderer';
import { PlacedRoomSvg } from '../src/components/pieces/PlacedRoomSvg';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';

const emptyGrid = new SparseOccupancyGrid([]);
const horizontal: ConnectionGeometry = {
  from: { position: { x: 0, y: 0.5 }, direction: 'east' },
  to: { position: { x: 4, y: 0.5 }, direction: 'west' },
};
function generate(points: ConnectionRoute['points'], geometry = horizontal): CorridorCell[] {
  const result = generateCorridorCells({ points }, geometry, emptyGrid);
  assert.equal(result.status, 'success');
  if (result.status !== 'success') throw new Error(result.status);
  return result.cells;
}

test('horizontal and vertical routes expand all cells and open toward both room connectors', () => {
  assert.deepEqual(generate([horizontal.from.position, horizontal.to.position]),
    [0, 1, 2, 3].map(x => ({ x, y: 0, connections: EAST | WEST })));
  const vertical: ConnectionGeometry = {
    from: { position: { x: 0.5, y: 0 }, direction: 'south' },
    to: { position: { x: 0.5, y: 4 }, direction: 'north' },
  };
  assert.deepEqual(generate([vertical.from.position, vertical.to.position], vertical),
    [0, 1, 2, 3].map(y => ({ x: 0, y, connections: NORTH | SOUTH })));
});

test('L and Z bends retain both directions without adding unrelated openings', () => {
  const l: ConnectionGeometry = { ...horizontal, to: { position: { x: 2.5, y: 3 }, direction: 'north' } };
  const cells = generate([l.from.position, { x: 2.5, y: 0.5 }, l.to.position], l);
  assert.equal(cells.length, 5);
  assert.deepEqual(cells.find(c => c.x === 2 && c.y === 0), { x: 2, y: 0, connections: WEST | SOUTH });
  const z: ConnectionGeometry = { ...horizontal, to: { position: { x: 5, y: 2.5 }, direction: 'west' } };
  const zCells = generate([z.from.position, { x: 2.5, y: 0.5 }, { x: 2.5, y: 2.5 }, z.to.position], z);
  assert.equal(zCells.length, 7);
  assert.equal(zCells.find(c => c.x === 2 && c.y === 2)?.connections, NORTH | EAST);
});

test('multiple bends, negative coordinates and duplicate points expand without duplicate cells', () => {
  const geometry: ConnectionGeometry = {
    from: { position: { x: -2, y: 0.5 }, direction: 'east' },
    to: { position: { x: 4, y: 2.5 }, direction: 'west' },
  };
  const cells = generate([
    geometry.from.position, geometry.from.position, { x: -0.5, y: 0.5 }, { x: -0.5, y: -1.5 },
    { x: 2.5, y: -1.5 }, { x: 2.5, y: 2.5 }, geometry.to.position,
  ], geometry);
  assert.equal(cells.length, 12);
  assert.equal(new Set(cells.map(c => `${c.x},${c.y}`)).size, 12);
  assert.equal(cells.find(c => c.x === -1 && c.y === 0)?.connections, WEST | NORTH);
  assert.equal(cells.find(c => c.x === 2 && c.y === -2)?.connections, WEST | SOUTH);
});

test('one-cell corridors combine both connector directions on the same cell', () => {
  const geometry: ConnectionGeometry = {
    from: { position: { x: 0, y: 0.5 }, direction: 'east' },
    to: { position: { x: 0.5, y: 1 }, direction: 'north' },
  };
  assert.deepEqual(generate([geometry.from.position, { x: 0.5, y: 0.5 }, geometry.to.position], geometry),
    [{ x: 0, y: 0, connections: WEST | SOUTH }]);
});

test('diagonal routes, unaligned bends and unaligned anchors are rejected without rounding', () => {
  for (const points of [
    [horizontal.from.position, { x: 1.5, y: 1.5 }, horizontal.to.position],
    [horizontal.from.position, { x: 2, y: 0.5 }, { x: 2, y: 2.5 }, { x: 3.5, y: 2.5 }, { x: 3.5, y: 0.5 }, horizontal.to.position],
  ]) assert.equal(generateCorridorCells({ points }, horizontal, emptyGrid).status, 'invalid-route');
  const geometry = { ...horizontal, from: { ...horizontal.from, position: { x: 0.25, y: 0.5 } } };
  assert.equal(generateCorridorCells({ points: [geometry.from.position, geometry.to.position] }, geometry, emptyGrid).status, 'invalid-route');
});

test('no corridor cell is generated inside occupied space', () => {
  const grid = new SparseOccupancyGrid([{ x: 2, y: 0 }]);
  assert.equal(generateCorridorCells({ points: [horizontal.from.position, horizontal.to.position] }, horizontal, grid).status, 'invalid-route');
});

test('expansion includes the exact limit and rejects huge paths before walking them', () => {
  for (const [length, expected] of [[MAX_CORRIDOR_CELLS, 'success'], [MAX_CORRIDOR_CELLS + 1, 'limit-exceeded'], [1_000_000_000, 'limit-exceeded']] as const) {
    const geometry = { ...horizontal, to: { ...horizontal.to, position: { x: length, y: 0.5 } } };
    const result = generateCorridorCells({ points: [geometry.from.position, geometry.to.position] }, geometry, emptyGrid);
    assert.equal(result.status, expected);
    if (result.status === 'success') assert.equal(result.cells.length, length);
  }
});

test('nonfinite caller budgets cannot disable the hard expansion limit', () => {
  const geometry = { ...horizontal, to: { ...horizontal.to, position: { x: 1_000_000_000, y: 0.5 } } };
  for (const budget of [NaN, Infinity]) {
    assert.equal(generateCorridorCells({ points: [geometry.from.position, geometry.to.position] }, geometry, emptyGrid, budget).status, 'limit-exceeded');
  }
});

const wallCases = [
  [NORTH, ['E', 'S', 'W']], [EAST, ['N', 'S', 'W']], [SOUTH, ['N', 'E', 'W']], [WEST, ['N', 'E', 'S']],
  [NORTH | SOUTH, ['E', 'W']], [EAST | WEST, ['N', 'S']],
  [NORTH | EAST, ['S', 'W']], [EAST | SOUTH, ['N', 'W']], [SOUTH | WEST, ['N', 'E']], [WEST | NORTH, ['E', 'S']],
  [NORTH | EAST | SOUTH, ['W']], [EAST | SOUTH | WEST, ['N']], [SOUTH | WEST | NORTH, ['E']], [WEST | NORTH | EAST, ['S']],
  [NORTH | EAST | SOUTH | WEST, []],
] as const;
for (const [mask, expected] of wallCases) {
  test(`wall openings match direction mask ${mask.toString(2).padStart(4, '0')}`, () => {
    const names = corridorWalls({ x: 0, y: 0, connections: mask }).map(w =>
      w.y1 === 0 && w.y2 === 0 ? 'N' : w.x1 === 1 && w.x2 === 1 ? 'E' : w.y1 === 1 && w.y2 === 1 ? 'S' : 'W');
    assert.deepEqual(names, expected);
  });
}

test('adjacent corridor cells have no walls across their shared boundary', () => {
  const cells = generate([horizontal.from.position, horizontal.to.position]);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(cells[i - 1].connections & EAST);
    assert.ok(cells[i].connections & WEST);
    assert.ok(!corridorWalls(cells[i - 1]).some(w => w.x1 === i && w.x2 === i));
    assert.ok(!corridorWalls(cells[i]).some(w => w.x1 === i && w.x2 === i));
  }
});

const square = DEFAULT_PIECES[0];
function placed(id: string, x: number, y: number, piece = square, rotation: Rotation = 0): PlacedRoom {
  return { id, pieceId: piece.id, piece, position: { x, y }, rotation };
}
const connection: Connection = {
  id: 'c', fromRoomId: 'a', fromConnectorId: 'piece-rect-4x4-east',
  toRoomId: 'b', toConnectorId: 'piece-rect-4x4-west', type: 'corridor',
};
const baseRooms = () => [placed('a', 0, 0), placed('b', 10, 4)];
function scene(rooms = baseRooms(), connections = [connection], previous?: ConnectionScene) {
  const grid = createOccupancyGrid(rooms);
  return prepareConnectionScene(connections, rooms, routeConnections(connections, rooms, grid), grid, previous?.cache);
}
function cellsOf(prepared: ConnectionScene, id = 'c') {
  const corridor = prepared.drawings.find(d => d.connection.id === id)?.corridor;
  assert.equal(corridor?.status, 'success');
  if (corridor?.status !== 'success') throw new Error('No corridor');
  return corridor.cells;
}

test('routing supplies cell-centred bends instead of letting the renderer round a grid-edge path', () => {
  const rooms = baseRooms();
  const result = routeConnections([connection], rooms).get('c')!;
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.method, 'a-star');
  assert.ok(isCellCenteredRoute(result.route, connectionGeometry(connection, rooms)!));
  const grid = createOccupancyGrid(rooms);
  assert.ok(cellsOf(scene(rooms)).every(cell => !grid.isOccupied(cell)));
});

test('adjacent opposed rooms connect directly without exterior corridor cells', () => {
  const rooms = [placed('a', 0, 0), placed('b', 4, 0)];
  const prepared = scene(rooms);
  assert.equal(prepared.drawings[0].result.status === 'success' && prepared.drawings[0].result.method, 'direct');
  assert.deepEqual(cellsOf(prepared), []);
  assert.ok(prepared.openConnectorIds.get('a')?.has(connection.fromConnectorId));
  assert.ok(prepared.openConnectorIds.get('b')?.has(connection.toConnectorId));
  const markup = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'overlays' }));
  assert.match(markup, /<circle/);
  assert.match(markup, /role="button"/);
  assert.doesNotMatch(markup, /data-corridor-floor/);
});

test('all four room rotations regenerate corridor cells and the correct room opening', () => {
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const room = placed('a', -8, -6, DEFAULT_PIECES[1], rotation);
    const c = { ...connection, fromConnectorId: 'piece-rect-3x6-north' };
    const rooms = [room, placed('b', 12, 10)];
    const prepared = scene(rooms, [c]);
    assert.ok(cellsOf(prepared).every(cell => !createOccupancyGrid(rooms).isOccupied(cell)));
    const markup = renderToStaticMarkup(createElement(PlacedRoomSvg,
      { room, isSelected: false, openConnectorIds: prepared.openConnectorIds.get('a') }));
    assert.match(markup, new RegExp(`data-room-opening="${[NORTH, EAST, SOUTH, WEST][rotation / 90]}"`));
  }
});

test('separate crossing connections retain separate masks and never create a logical junction', () => {
  const piece: Piece = { id: 'unit', name: 'unit', shape: 'rectangle', cells: [{ x: 0, y: 0 }],
    connectors: ['north', 'east', 'south', 'west'].map(direction => ({ id: direction, direction, width: 1, kind: 'door', position: { x: 0, y: 0 } })) as Piece['connectors'] };
  const rooms = [placed('a', -2, 0, piece), placed('b', 3, 0, piece), placed('top', 0, -2, piece), placed('bottom', 0, 3, piece)];
  const connections: Connection[] = [
    { ...connection, fromConnectorId: 'east', toConnectorId: 'west' },
    { ...connection, id: 'vertical', fromRoomId: 'top', fromConnectorId: 'south', toRoomId: 'bottom', toConnectorId: 'north' },
  ];
  const before = structuredClone(connections);
  const prepared = scene(rooms, connections);
  assert.equal(cellsOf(prepared).find(c => c.x === 0 && c.y === 0)?.connections, EAST | WEST);
  assert.equal(cellsOf(prepared, 'vertical').find(c => c.x === 0 && c.y === 0)?.connections, NORTH | SOUTH);
  assert.deepEqual(connections, before);
});

test('unchanged routes reuse cells, changed routes regenerate them, and deleted connections clear the cache', () => {
  const rooms = [...baseRooms(), placed('obstacle', 30, 20)];
  const initial = scene(rooms);
  const movedAway = scene([...rooms.slice(0, 2), placed('obstacle', 30, 24)], [connection], initial);
  assert.equal(cellsOf(movedAway), cellsOf(initial));
  const blocked = scene([...rooms.slice(0, 2), placed('obstacle', 6, 1)], [connection], movedAway);
  assert.notEqual(cellsOf(blocked), cellsOf(initial));
  const removed = scene(rooms, [], blocked);
  assert.equal(removed.cache.size, 0);
  assert.equal(removed.openConnectorIds.size, 0);
});

test('failed routes generate no floor or room openings, retain a warning, and recover automatically', () => {
  const rooms = [placed('a', 0, 0), placed('b', 16, 0), placed('block', 4, 0)];
  const prepared = scene(rooms);
  assert.equal(prepared.drawings[0].result.status, 'unreachable');
  assert.equal(prepared.drawings[0].corridor, undefined);
  assert.equal(prepared.openConnectorIds.size, 0);
  const floor = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'corridors' }));
  const warning = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'overlays' }));
  assert.doesNotMatch(floor, /data-corridor-floor/);
  assert.match(warning, /#dc2626/);
  assert.match(warning, /警告/);
  assert.ok(cellsOf(scene(rooms.slice(0, 2), [connection], prepared)).length > 0);
});

for (const type of ['door', 'stairs', 'secret'] as const) {
  test(`${type} retains line rendering rather than silently becoming a normal corridor`, () => {
    const prepared = scene(baseRooms(), [{ ...connection, type }]);
    assert.equal(prepared.drawings[0].corridor, undefined);
    assert.equal(prepared.openConnectorIds.size, 0);
    const markup = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'overlays' }));
    assert.doesNotMatch(markup, /data-corridor-floor/);
    if (type === 'secret') assert.match(markup, /stroke-dasharray="6 4"/);
  });
}

test('SVG batches floors and walls while preserving per-connection selection semantics', () => {
  const prepared = scene();
  const markup = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'corridors' }));
  assert.equal((markup.match(/data-corridor-floor=/g) ?? []).length, 1);
  assert.equal((markup.match(/data-corridor-walls=/g) ?? []).length, 1);
  assert.match(markup, /data-connection-id="c"/);
  assert.match(markup, /role="button"/);
  assert.match(markup, /tabindex="0"/);
  const selected = renderToStaticMarkup(createElement(CorridorRenderer, { cells: cellsOf(prepared), isSelected: true, interactive: true }));
  assert.match(selected, /#bfdbfe/);
  assert.match(selected, /#2563eb/);
});

test('total scene budget bounds cell expansion and falls back to lines for remaining connections', () => {
  const piece: Piece = { id: 'unit', name: 'unit', shape: 'rectangle', cells: [{ x: 0, y: 0 }], connectors: [
    { id: 'east', direction: 'east', width: 1, kind: 'door', position: { x: 0, y: 0 } },
    { id: 'west', direction: 'west', width: 1, kind: 'door', position: { x: 0, y: 0 } },
  ] };
  const rooms: PlacedRoom[] = [], connections: Connection[] = [];
  for (let i = 0; i < 5; i++) {
    rooms.push(placed(`a${i}`, -1, i * 2, piece), placed(`b${i}`, MAX_CORRIDOR_CELLS, i * 2, piece));
    connections.push({ ...connection, id: `c${i}`, fromRoomId: `a${i}`, fromConnectorId: 'east', toRoomId: `b${i}`, toConnectorId: 'west' });
  }
  const prepared = scene(rooms, connections);
  assert.equal(prepared.drawings.reduce((sum, d) => sum + (d.corridor?.status === 'success' ? d.corridor.cells.length : 0), 0), MAX_TOTAL_CORRIDOR_CELLS);
  assert.equal(prepared.drawings.at(-1)?.corridor?.status, 'limit-exceeded');
  const overlay = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'overlays' }));
  assert.match(overlay, /通路セルの展開上限/);
  assert.match(overlay, /data-connection-id="c4"/);
});

const state = () => useDungeonStore.getState();
const currentScene = () => scene(state().dungeon.rooms, state().dungeon.connections);
function setup() {
  state().newDungeon();
  [placed('a', 0, 0), placed('b', 16, 0)].forEach(r => state().addRoom(r));
  state().addConnection({ roomId: 'a', connectorId: connection.fromConnectorId }, { roomId: 'b', connectorId: connection.toConnectorId });
}

test('move/rotate/third-room/delete/undo/redo regenerate corridor geometry from logical state', () => {
  setup();
  const original = cellsOf(currentScene(), state().dungeon.connections[0].id);
  state().moveRoom('b', { x: 16, y: 5 });
  const moved = cellsOf(currentScene(), state().dungeon.connections[0].id);
  assert.notDeepEqual(moved, original);
  state().rotateRoom('b');
  const rotated = cellsOf(currentScene(), state().dungeon.connections[0].id);
  state().undo(); assert.deepEqual(cellsOf(currentScene(), state().dungeon.connections[0].id), moved);
  state().redo(); assert.deepEqual(cellsOf(currentScene(), state().dungeon.connections[0].id), rotated);
  state().addRoom(placed('obstacle', 8, 0));
  const avoided = cellsOf(currentScene(), state().dungeon.connections[0].id);
  assert.notDeepEqual(avoided, rotated);
  state().deleteRoom('obstacle');
  assert.deepEqual(cellsOf(currentScene(), state().dungeon.connections[0].id), rotated);
  const c = state().dungeon.connections[0];
  state().selectConnection(c.id);
  assert.equal(state().selectedConnectionId, c.id);
  state().deleteConnection(c.id); assert.equal(currentScene().drawings.length, 0);
  state().undo(); assert.deepEqual(cellsOf(currentScene(), c.id), rotated);
  state().redo(); assert.equal(currentScene().drawings.length, 0);
});

function assertLogicalOnly(dungeon: DungeonDocument) {
  assert.ok(!/"(?:corridor|corridorCells|corridorGeometry|assetId|drawings|openConnectorIds|cache|routingStatus)"\s*:/.test(JSON.stringify(dungeon)));
  dungeon.rooms.forEach(r => assert.deepEqual(Object.keys(r).sort(), ['id', 'pieceId', 'piece', 'position', 'rotation'].sort()));
}

test('JSON and IndexedDB regenerate corridors and preserve manually placed corridor pieces', async () => {
  setup();
  state().addRoom(placed('manual', 4, 10, DEFAULT_PIECES[3]));
  const before = structuredClone(state().dungeon);
  const expected = cellsOf(currentScene(), before.connections[0].id);
  assert.equal(state().dungeon.rooms.length, 3);
  assert.deepEqual(state().dungeon, before);
  const envelope = buildExportEnvelope(before);
  assert.equal(envelope.schemaVersion, '1.1.0');
  const imported = parseImport(JSON.parse(JSON.stringify(envelope))).dungeon;
  assert.deepEqual(cellsOf(scene(imported.rooms, imported.connections), before.connections[0].id), expected);
  await dungeonRepository.saveMainEditorSnapshot(before);
  const loaded = await dungeonRepository.load(before.id);
  assert.ok(loaded);
  assert.deepEqual(cellsOf(scene(loaded.rooms, loaded.connections), before.connections[0].id), expected);
  assert.deepEqual(loaded.rooms.find(r => r.id === 'manual'), before.rooms.find(r => r.id === 'manual'));
  [imported, loaded, ...state().undoStack].forEach(assertLogicalOnly);
  state().moveRoom('manual', { x: 6, y: 10 });
  state().rotateRoom('manual');
  assert.equal(state().dungeon.rooms.find(r => r.id === 'manual')?.rotation, 90);
});

after(async () => { await db.delete(); });
