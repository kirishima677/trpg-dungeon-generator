import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Connection, ConnectionType, DungeonDocument, Piece, PlacedRoom } from '../src/model/types';
import type { CorridorContribution, CorridorNetwork } from '../src/editor/connectors/corridor/corridorNetwork';
import { buildCorridorNetwork, connectionActionForCell, nextConnectionCandidate } from '../src/editor/connectors/corridor/corridorNetwork';
import { EAST, NORTH, SOUTH, WEST } from '../src/editor/connectors/corridor/directions';
import { corridorWalls } from '../src/editor/connectors/corridor/corridorShape';
import { prepareConnectionScene } from '../src/editor/connectors/corridor/connectionScene';
import { createOccupancyGrid } from '../src/editor/connectors/routing/occupancyGrid';
import { routeConnections } from '../src/editor/connectors/routing/connectionRouter';
import { CorridorRenderer } from '../src/components/connections/CorridorRenderer';
import { ConnectionRenderer } from '../src/components/connections/ConnectionRenderer';
import { GridCanvas } from '../src/components/canvas/GridCanvas';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport, SCHEMA_VERSION } from '../src/utils/exportImport';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';

const H = EAST | WEST, V = NORTH | SOUTH;
const source = (connectionId: string, connections: number, x = 0, y = 0, type: ConnectionType = 'corridor'): CorridorContribution =>
  ({ connectionId, type, cells: [{ x, y, connections }] });
const at = (network: CorridorNetwork, x = 0, y = 0) => network.byCoordinate.get(`${x},${y}`)?.find(c => c.type === 'corridor');

test('empty, zero-cell and single negative-coordinate contributions produce a sparse network', () => {
  assert.deepEqual(buildCorridorNetwork([]), { cells: [], byCoordinate: new Map() });
  assert.equal(buildCorridorNetwork([{ connectionId: 'direct', type: 'corridor', cells: [] }]).cells.length, 0);
  const n = buildCorridorNetwork([source('a', H, -1_000_000, -7)]);
  assert.deepEqual(n.cells, [{ x: -1_000_000, y: -7, connections: H, type: 'corridor', sourceConnectionIds: ['a'] }]);
  assert.equal(n.byCoordinate.get('-1000000,-7')?.[0], n.cells[0]);
});

test('crossing corridors OR their masks and deduplicate repeated cells and source IDs', () => {
  const n = buildCorridorNetwork([source('b', V), source('a', H), source('b', V), source('a', H)]);
  assert.deepEqual(n.cells, [{ x: 0, y: 0, connections: 15, type: 'corridor', sourceConnectionIds: ['a', 'b'] }]);
  assert.deepEqual(corridorWalls(n.cells[0]), []);
});

for (const [base, branch, expected] of [[H, NORTH, 11], [V, EAST, 7], [H, SOUTH, 14], [V, WEST, 13]]) {
  test(`merged T junction ${expected} has exactly one closed wall`, () => {
    const n = buildCorridorNetwork([source('straight', base), source('branch', branch)]);
    assert.equal(at(n)?.connections, expected);
    assert.equal(corridorWalls(n.cells[0]).length, 1);
  });
}

test('full and partial overlap preserve endpoints and sources without multiplying floor cells', () => {
  const a = { connectionId: 'a', type: 'corridor' as const, cells: [0, 1, 2].map(x => ({ x, y: 0, connections: H })) };
  const b = { ...a, connectionId: 'b' };
  assert.equal(buildCorridorNetwork([a, b]).cells.length, 3);
  const partial = buildCorridorNetwork([a, { ...b, cells: [1, 2, 3].map(x => ({ x, y: 0, connections: H })) }]);
  assert.equal(partial.cells.length, 4);
  assert.deepEqual(partial.cells.map(c => c.sourceConnectionIds), [['a'], ['a', 'b'], ['a', 'b'], ['b']]);
  assert.ok(partial.cells.every(c => c.connections === H));
});

test('corners and three or more sources merge only their actual direction bits', () => {
  const n = buildCorridorNetwork([source('z', NORTH | EAST), source('a', SOUTH), source('m', EAST)]);
  assert.equal(at(n)?.connections, 7);
  assert.deepEqual(at(n)?.sourceConnectionIds, ['a', 'm', 'z']);
});

test('nearby and parallel cells do not create adjacency-based openings', () => {
  const n = buildCorridorNetwork([source('a', V), source('b', V, 1, 0), source('c', H, 0, 1)]);
  assert.equal(n.cells.length, 3);
  assert.equal(at(n)?.connections, V);
  assert.equal(at(n, 1, 0)?.connections, V);
  assert.equal(at(n, 0, 1)?.connections, H);
  assert.equal(corridorWalls(at(n)!).length, 2);
});

for (const type of ['door', 'stairs', 'secret'] as const) {
  test(`${type} remains independent of normal corridors and other special connections at the same coordinate`, () => {
    const n = buildCorridorNetwork([source('normal', H), source('special-a', NORTH, 0, 0, type), source('special-b', SOUTH, 0, 0, type)]);
    assert.equal(n.cells.length, 3);
    assert.equal(n.byCoordinate.get('0,0')?.length, 3);
    assert.equal(at(n)?.connections, H);
    assert.deepEqual(n.cells.filter(c => c.type === type).map(c => c.sourceConnectionIds), [['special-a'], ['special-b']]);
  });
}

test('aggregation is deterministic across contribution/cell order without mutating inputs', () => {
  const input = [source('b', V), source('a', H), source('secret', V, 0, 0, 'secret'), source('negative', H, -2, -1)];
  input[0].cells = [...input[0].cells, { x: 0, y: 1, connections: V }];
  const before = structuredClone(input);
  assert.deepEqual(buildCorridorNetwork(input), buildCorridorNetwork([...input].reverse().map(c => ({ ...c, cells: [...c.cells].reverse() }))));
  assert.deepEqual(input, before);
  const n = buildCorridorNetwork(input);
  n.cells[0].connections = 0;
  n.cells[0].sourceConnectionIds.push('new');
  assert.deepEqual(input, before);
});

test('removing contributions regenerates cross -> T -> straight, discarding only unused cells', () => {
  const a = source('a', H), b = source('b', NORTH), c = source('c', SOUTH);
  const extra = source('a', H, -1, 0);
  assert.equal(at(buildCorridorNetwork([a, b, c, extra]))?.connections, 15);
  assert.equal(at(buildCorridorNetwork([a, b, extra]))?.connections, 11);
  const remaining = buildCorridorNetwork([b, c]);
  assert.equal(at(remaining)?.connections, V);
  assert.equal(at(remaining, -1, 0), undefined);
  assert.deepEqual(at(remaining)?.sourceConnectionIds, ['b', 'c']);
});

function renderNetwork(network: CorridorNetwork, selected?: string) {
  const selectedCellKeys = new Set(network.cells.filter(c => selected && c.sourceConnectionIds.includes(selected)).map(c => `${c.x},${c.y}`));
  return renderToStaticMarkup(createElement(CorridorRenderer, { cells: network.cells, isSelected: false, interactive: true, selectedCellKeys }));
}
const pathData = (markup: string, attribute: string) => [...markup.matchAll(new RegExp(`<path[^>]*${attribute}="true"[^>]* d="([^"]*)"`, 'g'))].map(m => m[1]).join(' ');

test('merged cross renders one floor and no internal walls regardless of input or selection order', () => {
  const input = [source('a', H), source('b', V)];
  const markup = renderNetwork(buildCorridorNetwork(input), 'a');
  assert.equal((pathData(markup, 'data-corridor-floor').match(/Z/g) ?? []).length, 1);
  assert.equal(pathData(markup, 'data-corridor-walls'), '');
  assert.equal(markup, renderNetwork(buildCorridorNetwork([...input].reverse()), 'a'));
});

test('T shapes keep one wall, shared boundaries are drawn once, and selection covers the whole source', () => {
  for (const mask of [7, 11, 13, 14]) {
    const markup = renderNetwork(buildCorridorNetwork([source('a', mask), source('b', mask)]));
    assert.equal((pathData(markup, 'data-corridor-walls').match(/M /g) ?? []).length, 1);
  }
  const n = buildCorridorNetwork([source('a', V), source('b', V, 1, 0), source('a', V, 0, 1)]);
  const markup = renderNetwork(n, 'a');
  const edges = pathData(markup, 'data-corridor-walls').match(/M [^M]+/g)?.map(s => s.trim()) ?? [];
  assert.equal(new Set(edges).size, edges.length);
  assert.equal(edges.length, 5); // Six closed edges, one common wall.
  const highlighted = markup.match(/data-corridor-floor="true" data-highlighted="true" d="([^"]+)"/)?.[1] ?? '';
  assert.equal((highlighted.match(/Z/g) ?? []).length, 2);
  assert.equal((pathData(markup, 'data-corridor-floor').match(/Z/g) ?? []).length, 3);
});

test('cell grids separate every open side at straights, corners and all junction orientations without covering walls', () => {
  for (const mask of [H, V, 3, 6, 12, 9, 7, 11, 13, 14, 15]) {
    const markup = renderNetwork(buildCorridorNetwork([source('a', mask)]));
    const grid = pathData(markup, 'data-corridor-grid').match(/M [^M]+/g)?.map(s => s.trim()) ?? [];
    const walls = pathData(markup, 'data-corridor-walls').match(/M [^M]+/g)?.map(s => s.trim()) ?? [];
    assert.equal(grid.length, mask.toString(2).replaceAll('0', '').length);
    assert.equal(grid.length + walls.length, 4);
    assert.ok(grid.every(edge => !walls.includes(edge)));
    assert.match(markup, /data-corridor-grid="true"[^>]*stroke="#475569" stroke-width="1.5" pointer-events="none"/);
  }
});

test('shared straight sections and crossings draw each cell divider once', () => {
  const cells = [0, 1, 2].map(x => ({ x, y: 0, connections: H }));
  const n = buildCorridorNetwork([
    { connectionId: 'a', type: 'corridor', cells }, { connectionId: 'b', type: 'corridor', cells },
  ]);
  const markup = renderNetwork(n);
  const dividers = pathData(markup, 'data-corridor-grid').match(/M [^M]+/g)?.map(s => s.trim()).sort();
  assert.deepEqual(dividers, [0, 40, 80, 120].map(x => `M ${x} 0 L ${x} 40`).sort());
  const cross = renderNetwork(scene().network);
  const lines = pathData(cross, 'data-corridor-grid').match(/M [^M]+/g)?.map(s => s.trim()) ?? [];
  assert.equal(lines.length, 10); // Six cell-to-cell dividers and four room openings.
  assert.equal(new Set(lines).size, lines.length);
});

test('selection keeps dividers above both floor colors and below external walls', () => {
  const n = scene().network;
  const plain = renderNetwork(n), selected = renderNetwork(n, 'a-horizontal');
  assert.equal(pathData(selected, 'data-corridor-grid'), pathData(plain, 'data-corridor-grid'));
  const gridIndex = selected.indexOf('data-corridor-grid');
  assert.ok(gridIndex > selected.lastIndexOf('data-corridor-floor'));
  assert.ok(gridIndex < selected.indexOf('data-corridor-walls'));
  const allSelected = renderToStaticMarkup(createElement(CorridorRenderer, { cells: n.cells, isSelected: true, interactive: false }));
  assert.equal(pathData(allSelected, 'data-corridor-grid'), pathData(plain, 'data-corridor-grid'));
  assert.match(allSelected, /data-corridor-grid="true"[^>]*pointer-events="none"/);
  // Zustand's server snapshot reads initial state rather than the live store.
  const serverState = useDungeonStore.getInitialState();
  const previousView = serverState.view;
  try {
    serverState.view = { ...previousView, panX: 80, panY: -40, zoom: 0.5 };
    const transformed = renderToStaticMarkup(createElement(GridCanvas, { width: 800, height: 600 },
      createElement(CorridorRenderer, { cells: n.cells, isSelected: false, interactive: true })));
    assert.match(transformed, /<g transform="translate\(80,-40\) scale\(0.5\)">/);
    assert.equal(pathData(transformed, 'data-corridor-grid'), pathData(plain, 'data-corridor-grid'));
    assert.ok(transformed.indexOf('translate(80,-40)') < transformed.indexOf('data-corridor-grid'));
  } finally {
    serverState.view = previousView;
  }
});

test('shared-cell clicks cycle individual sources and delete mode never guesses a shared source', () => {
  const shared = at(buildCorridorNetwork([source('b', V), source('a', H)]))!;
  assert.equal(nextConnectionCandidate([], null), null);
  assert.equal(nextConnectionCandidate(shared.sourceConnectionIds, 'missing'), 'a');
  assert.deepEqual(connectionActionForCell(shared, null, true), { type: 'select', connectionId: 'a' });
  assert.deepEqual(connectionActionForCell(shared, 'a', true), { type: 'select', connectionId: 'b' });
  assert.deepEqual(connectionActionForCell(shared, 'b', false), { type: 'select', connectionId: 'a' });
  const single = at(buildCorridorNetwork([source('a', H)]))!;
  assert.deepEqual(connectionActionForCell(single, null, true), { type: 'delete', connectionId: 'a' });
});

const unit: Piece = { id: 'unit', name: 'unit', shape: 'rectangle', cells: [{ x: 0, y: 0 }],
  connectors: (['north', 'east', 'south', 'west'] as const).map(direction => ({ id: direction, direction, width: 1, kind: 'door', position: { x: 0, y: 0 } })) };
const room = (id: string, x: number, y: number): PlacedRoom => ({ id, pieceId: unit.id, piece: unit, position: { x, y }, rotation: 0 });
const rooms = () => [room('left', -2, 0), room('right', 3, 0), room('top', 0, -2), room('bottom', 0, 3)];
const connections = (): Connection[] => [
  { id: 'a-horizontal', type: 'corridor', fromRoomId: 'left', fromConnectorId: 'east', toRoomId: 'right', toConnectorId: 'west' },
  { id: 'b-vertical', type: 'corridor', fromRoomId: 'top', fromConnectorId: 'south', toRoomId: 'bottom', toConnectorId: 'north' },
];
function scene(r = rooms(), c = connections(), previous?: ReturnType<typeof prepareConnectionScene>) {
  const grid = createOccupancyGrid(r);
  return prepareConnectionScene(c, r, routeConnections(c, r, grid), grid, previous?.cache);
}

test('real routing builds a physical cross without adding or changing logical connections', () => {
  const r = rooms(), c = connections(), before = structuredClone({ r, c });
  const initial = scene(r, c);
  assert.equal(at(initial.network)?.connections, 15);
  assert.deepEqual(at(initial.network)?.sourceConnectionIds, ['a-horizontal', 'b-vertical']);
  assert.equal(initial.network.cells.length, 7);
  assert.deepEqual(initial.network, scene(r, [...c].reverse()).network);
  assert.deepEqual({ r, c }, before);
  assert.equal(scene([room('left', -1, 0), room('right', 0, 0)], c.slice(0, 1)).network.cells.length, 0);
});

test('a failed source leaves the successful shared path and warning, then remerges on recovery', () => {
  const initial = scene();
  const blocked = scene([...rooms(), room('block', -1, 0)], connections(), initial);
  assert.equal(blocked.drawings.find(d => d.connection.id === 'a-horizontal')?.result.status, 'unreachable');
  assert.equal(at(blocked.network)?.connections, V);
  assert.deepEqual(at(blocked.network)?.sourceConnectionIds, ['b-vertical']);
  assert.ok(!blocked.network.cells.some(c => c.sourceConnectionIds.includes('a-horizontal')));
  const overlay = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: blocked, layer: 'overlays' }));
  assert.match(overlay, /警告/);
  assert.match(overlay, /#dc2626/);
  assert.deepEqual(scene(rooms(), connections(), blocked).network, initial.network);
});

test('special routing keeps its line independent from the crossing normal network', () => {
  for (const type of ['door', 'stairs', 'secret'] as const) {
    const c = connections(); c[1].type = type;
    const prepared = scene(rooms(), c);
    assert.equal(at(prepared.network)?.connections, H);
    assert.deepEqual(at(prepared.network)?.sourceConnectionIds, ['a-horizontal']);
    const overlay = renderToStaticMarkup(createElement(ConnectionRenderer, { scene: prepared, layer: 'overlays' }));
    assert.match(overlay, /data-connection-id="b-vertical"/);
    if (type === 'secret') assert.match(overlay, /stroke-dasharray="6 4"/);
  }
});

const state = () => useDungeonStore.getState();
const current = () => scene(state().dungeon.rooms, state().dungeon.connections);
function setup() {
  state().newDungeon();
  rooms().forEach(r => state().addRoom(r));
  connections().forEach(c => state().addConnection({ roomId: c.fromRoomId, connectorId: c.fromConnectorId }, { roomId: c.toRoomId, connectorId: c.toConnectorId }));
}

test('selected source deletion and room deletion preserve others through undo/redo', () => {
  setup();
  const initial = current().network, id = state().dungeon.connections[0].id;
  state().selectConnection(id);
  assert.equal(state().selectedConnectionId, id);
  state().deleteConnection(id);
  assert.equal(at(current().network)?.connections, V);
  assert.equal(at(current().network, -1, 0), undefined);
  state().undo(); assert.deepEqual(current().network, initial);
  state().redo(); assert.equal(at(current().network)?.connections, V);
  state().undo();
  state().deleteRoom('left');
  assert.equal(state().dungeon.connections.length, 1);
  assert.equal(at(current().network)?.connections, V);
  state().undo(); assert.deepEqual(current().network, initial);
});

test('move, rotate and third-room changes regenerate merged cells and undo restores the cross', () => {
  setup();
  const initial = current().network;
  state().moveRoom('right', { x: 3, y: 2 });
  const moved = current().network; assert.notDeepEqual(moved, initial);
  state().rotateRoom('right');
  const rotated = current().network; assert.notDeepEqual(rotated, moved);
  state().undo(); assert.deepEqual(current().network, moved);
  state().undo(); assert.deepEqual(current().network, initial);
  state().addRoom(room('third', 1, 0));
  assert.notDeepEqual(current().network, initial);
  assert.ok(current().network.cells.every(c => !createOccupancyGrid(state().dungeon.rooms).isOccupied(c)));
  state().deleteRoom('third'); assert.deepEqual(current().network, initial);
});

function assertLogicalOnly(d: DungeonDocument) {
  assert.doesNotMatch(JSON.stringify(d), /"(?:network|byCoordinate|sourceConnectionIds|corridorCells|openConnectorIds|cache)"\s*:/);
  d.connections.forEach(c => assert.deepEqual(Object.keys(c).sort(), ['id', 'type', 'fromRoomId', 'fromConnectorId', 'toRoomId', 'toConnectorId'].sort()));
}

test('JSON, IndexedDB and history contain logical data only and reconstruct the same network', async () => {
  setup();
  const before = structuredClone(state().dungeon), expected = current().network;
  const envelope = buildExportEnvelope(before);
  assert.equal(envelope.schemaVersion, SCHEMA_VERSION);
  const imported = parseImport(JSON.parse(JSON.stringify(envelope))).dungeon;
  assert.deepEqual(scene(imported.rooms, imported.connections).network, expected);
  await dungeonRepository.saveMainEditorSnapshot(before);
  const loaded = await dungeonRepository.load(before.id);
  assert.ok(loaded);
  assert.deepEqual(scene(loaded.rooms, loaded.connections).network, expected);
  [state().dungeon, imported, loaded, ...state().undoStack].forEach(assertLogicalOnly);
});

after(async () => { await db.delete(); });
