import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import type { Connection, ConnectorDirection, DungeonDocument, PlacedRoom, Rotation } from '../src/model/types';
import { getWorldCells } from '../src/utils/geometry';
import { connectionGeometry, connectorOutsideCell } from '../src/editor/connectors/connectionGeometry';
import type { ConnectionGeometry } from '../src/editor/connectors/connectionGeometry';
import { createOccupancyGrid, isRouteClear, SparseOccupancyGrid } from '../src/editor/connectors/routing/occupancyGrid';
import { aStarRoute, MAX_EXPLORED_NODES, MAX_SEARCH_SPAN_CELLS, searchBounds } from '../src/editor/connectors/routing/aStarRouter';
import { obstacleAvoidingRouter } from '../src/editor/connectors/routing/obstacleAvoidingRouter';
import { orthogonalRouter } from '../src/editor/connectors/routing/orthogonalRouter';
import { resolveConnectionRoute, routeConnection, routeConnections } from '../src/editor/connectors/routing/connectionRouter';
import { followsConnectorDirections, simplifyRoutePoints } from '../src/editor/connectors/routing/routeUtils';
import type { GridPosition, RoutingResult } from '../src/editor/connectors/routing/types';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';

const square = DEFAULT_PIECES[0];
function placed(id: string, x: number, y: number, piece = square, rotation: Rotation = 0): PlacedRoom {
  return { id, pieceId: piece.id, piece, position: { x, y }, rotation };
}
const connection: Connection = {
  id: 'connection', fromRoomId: 'a', fromConnectorId: 'piece-rect-4x4-east',
  toRoomId: 'b', toConnectorId: 'piece-rect-4x4-west', type: 'secret',
};
const endpoints = () => [placed('a', 0, 0), placed('b', 16, 0)];

/** Independent geometric oracle: sample every leg, not just its endpoints. */
function assertSafe(result: RoutingResult, geometry: ConnectionGeometry, rooms: PlacedRoom[]) {
  assert.equal(result.status, 'success');
  if (result.status !== 'success') throw new Error(result.status);
  assert.ok(followsConnectorDirections(result.route, geometry));
  const points = result.route.points;
  const cells = rooms.flatMap(room => getWorldCells(room));
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    assert.ok((from.x === to.x) !== (from.y === to.y));
    const steps = Math.ceil((Math.abs(from.x - to.x) + Math.abs(from.y - to.y)) * 8);
    for (let step = 1; step < steps; step++) {
      const x = from.x + (to.x - from.x) * step / steps;
      const y = from.y + (to.y - from.y) * step / steps;
      assert.ok(!cells.some(cell => x > cell.x && x < cell.x + 1 && y > cell.y && y < cell.y + 1),
        `Segment crosses occupied cell at (${x}, ${y})`);
    }
  }
  assert.deepEqual(points[0], geometry.from.position);
  assert.deepEqual(points.at(-1), geometry.to.position);
  return result;
}

for (const piece of DEFAULT_PIECES) {
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    test(`occupancy: ${piece.id} ${rotation}° uses actual cells, including negative coordinates`, () => {
      const room = placed('room', -12, -8, piece, rotation);
      const grid = createOccupancyGrid([room]);
      const cells = getWorldCells(room);
      assert.equal(grid.size, piece.cells.length);
      for (let x = -13; x <= -4; x++) {
        for (let y = -9; y <= 0; y++) {
          assert.equal(grid.isOccupied({ x, y }), cells.some(c => c.x === x && c.y === y));
        }
      }
    });
  }
}

test('sparse occupancy combines rooms without allocating the space between them', () => {
  const grid = createOccupancyGrid([placed('a', -1_000_000, -1_000_000), placed('b', 1_000_000, 1_000_000)]);
  assert.equal(grid.size, 32);
  assert.equal(grid.isOccupied({ x: 0, y: 0 }), false);
  assert.equal(grid.isOccupied({ x: -1_000_000, y: -1_000_000 }), true);
  assert.ok(grid.intersectsSegment({ x: -2_000_000, y: -999_999.5 }, { x: 2_000_000, y: -999_999.5 }));
});

test('fractional imported occupied cells are conservatively covered', () => {
  const grid = new SparseOccupancyGrid([{ x: -0.25, y: 0.25 }]);
  assert.equal(grid.size, 4);
  assert.ok(grid.isOccupied({ x: -1, y: 0 }));
  assert.ok(grid.isOccupied({ x: 0, y: 1 }));
});

test('full-segment collision catches obstacles between otherwise clear endpoints and bends', () => {
  const grid = new SparseOccupancyGrid([{ x: 5, y: 0 }, { x: 8, y: 5 }]);
  assert.equal(isRouteClear({ points: [{ x: 0.5, y: 0.5 }, { x: 10.5, y: 0.5 }] }, grid), false);
  assert.equal(isRouteClear({ points: [{ x: 8.5, y: 1.5 }, { x: 8.5, y: 10.5 }] }, grid), false);
  assert.equal(isRouteClear({ points: [{ x: 0.5, y: 2.5 }, { x: 10.5, y: 2.5 }] }, grid), true);
  assert.equal(isRouteClear({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, grid), false);
  assert.equal(isRouteClear({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }, grid), false);
});

test('routes cannot slip along occupied wall boundaries, but connector-endpoint touches are valid', () => {
  const grid = new SparseOccupancyGrid([{ x: 0, y: 0 }]);
  assert.ok(grid.intersectsSegment({ x: -1, y: 0 }, { x: 2, y: 0 }));
  assert.ok(grid.intersectsSegment({ x: 1, y: -1 }, { x: 1, y: 2 }));
  assert.equal(grid.intersectsSegment({ x: 1, y: 0.5 }, { x: 2, y: 0.5 }), false);
});

test('unblocked orthogonal routes are retained without spending an A* node budget', () => {
  const rooms = endpoints(), geometry = connectionGeometry(connection, rooms)!;
  const result = obstacleAvoidingRouter(geometry, createOccupancyGrid(rooms), { maxExploredNodes: 0 });
  assertSafe(result, geometry, rooms);
  assert.equal(result.status === 'success' && result.method, 'orthogonal');
  assert.deepEqual(result.status === 'success' && result.route, orthogonalRouter(geometry));
});

test('A* avoids a single room and multiple rooms with horizontal and vertical segments', () => {
  for (const obstacles of [[placed('c', 7, 0)], [placed('c', 6, 0), placed('d', 11, -2)]]) {
    const rooms = [...endpoints(), ...obstacles];
    const result = resolveConnectionRoute(connection, rooms);
    assertSafe(result, connectionGeometry(connection, rooms)!, rooms);
    assert.equal(result.status === 'success' && result.method, 'a-star');
    assert.deepEqual(resolveConnectionRoute(connection, rooms), result);
  }
});

test('manually placed corridor pieces are also obstacles', () => {
  const rooms = [...endpoints(), placed('corridor', 8, 0, DEFAULT_PIECES[3], 90)];
  const result = resolveConnectionRoute(connection, rooms);
  assertSafe(result, connectionGeometry(connection, rooms)!, rooms);
  assert.equal(result.status === 'success' && result.method, 'a-star');
});

test('A* passes a one-cell opening and returns a shortest unit-cost path', () => {
  const cells: GridPosition[] = [];
  for (let y = -5; y <= 5; y++) if (y !== 0) cells.push({ x: 2, y });
  const grid = new SparseOccupancyGrid(cells);
  const result = aStarRoute({ x: 0, y: 2 }, { x: 4, y: 2 }, grid);
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.cells.length - 1, 8);
  assert.ok(result.cells.some(cell => cell.x === 2 && cell.y === 0));
  for (let i = 1; i < result.cells.length; i++) {
    assert.equal(Math.abs(result.cells[i].x - result.cells[i - 1].x) + Math.abs(result.cells[i].y - result.cells[i - 1].y), 1);
    assert.equal(grid.isOccupied(result.cells[i]), false);
  }
});

test('A* handles identical exterior cells and route simplification preserves corners', () => {
  const grid = new SparseOccupancyGrid([]);
  const cell = { x: -2, y: -3 };
  const result = aStarRoute(cell, cell, grid);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.status === 'success' && result.cells, [cell]);
  assert.deepEqual(simplifyRoutePoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]),
    [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  const geometry: ConnectionGeometry = {
    from: { position: { x: 0, y: 0.5 }, direction: 'east' },
    to: { position: { x: 0.5, y: 1 }, direction: 'north' },
  };
  assert.deepEqual(connectorOutsideCell(geometry.from), connectorOutsideCell(geometry.to));
  assertSafe(obstacleAvoidingRouter(geometry, grid), geometry, []);
});

for (const fromDirection of ['north', 'east', 'south', 'west'] as ConnectorDirection[]) {
  for (const toDirection of ['north', 'east', 'south', 'west'] as ConnectorDirection[]) {
    test(`direction-aware avoidance: ${fromDirection} -> ${toDirection}`, () => {
      const rooms = [placed('a', 0, 0), placed('b', 16, 10), placed('obstacle', 8, 4)];
      const c = { ...connection,
        fromConnectorId: square.connectors.find(c => c.direction === fromDirection)!.id,
        toConnectorId: square.connectors.find(c => c.direction === toDirection)!.id };
      const result = resolveConnectionRoute(c, rooms);
      assertSafe(result, connectionGeometry(c, rooms)!, rooms);
    });
  }
}

test('L-shaped empty regions remain routable rather than blocking the bounding rectangle', () => {
  const lRoom = placed('l', 0, 0, DEFAULT_PIECES[2]);
  const grid = createOccupancyGrid([lRoom]);
  assert.equal(grid.isOccupied({ x: 2, y: 1 }), false);
  assert.equal(grid.isOccupied({ x: 3, y: 2 }), false);
  const result = aStarRoute({ x: 2, y: 1 }, { x: 5, y: 1 }, grid);
  assert.equal(result.status, 'success');
  assert.equal(result.status === 'success' && result.cells.length, 4);
});

test('source and target rooms remain obstacles even when their connectors face away', () => {
  const rooms = endpoints();
  const c = { ...connection, fromConnectorId: 'piece-rect-4x4-west', toConnectorId: 'piece-rect-4x4-east' };
  const result = resolveConnectionRoute(c, rooms);
  assertSafe(result, connectionGeometry(c, rooms)!, rooms);
});

test('occupied start/goal fail without deleting the connection and keep a warning fallback', () => {
  for (const x of [4, 12]) {
    const rooms = [...endpoints(), placed('block', x, 0)];
    const before = structuredClone(connection);
    const result = resolveConnectionRoute(connection, rooms);
    assert.equal(result.status, 'unreachable');
    assert.deepEqual(connection, before);
    assert.ok(result.status === 'unreachable' && result.fallback.points.length >= 2);
    assert.equal(routeConnection(connection, rooms), null);
  }
});

test('complete enclosure is unreachable, distinct from clipped bounds or node limits', () => {
  const ring = new SparseOccupancyGrid([{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]);
  assert.equal(aStarRoute({ x: 0, y: 0 }, { x: 4, y: 0 }, ring).status, 'unreachable');
  assert.equal(aStarRoute({ x: 4, y: 0 }, { x: 0, y: 0 }, ring).status, 'unreachable');
  const wall = new SparseOccupancyGrid([{ x: 2, y: 0 }]);
  assert.equal(aStarRoute({ x: 0, y: 0 }, { x: 4, y: 0 }, wall,
    { bounds: { minX: 0, minY: 0, maxX: 4, maxY: 0 } }).status, 'limit-exceeded');
  const limited = aStarRoute({ x: 0, y: 0 }, { x: 4, y: 0 }, wall, { maxExploredNodes: 1 });
  assert.deepEqual(limited, { status: 'limit-exceeded', exploredNodes: 1 });
});

test('search bounds and explored nodes stay capped, including very wide sparse scenes', () => {
  const grid = new SparseOccupancyGrid([{ x: -1_000_000, y: -1_000_000 }, { x: 1_000_000, y: 1_000_000 }]);
  const bounds = searchBounds({ x: 0, y: 0 }, { x: 10, y: 10 }, grid)!;
  assert.ok(bounds.maxX - bounds.minX + 1 <= MAX_SEARCH_SPAN_CELLS);
  assert.ok(bounds.maxY - bounds.minY + 1 <= MAX_SEARCH_SPAN_CELLS);
  assert.equal(aStarRoute({ x: 0, y: 0 }, { x: MAX_SEARCH_SPAN_CELLS, y: 0 }, grid).status, 'limit-exceeded');
  // A long wall makes the target inaccessible within the default node budget.
  const wall = new SparseOccupancyGrid([
    ...Array.from({ length: 1000 }, (_, y) => ({ x: 2, y: y - 500 })),
    { x: -1000, y: 0 },
  ]);
  const result = aStarRoute({ x: 0, y: 0 }, { x: 4, y: 0 }, wall);
  assert.equal(result.status, 'limit-exceeded');
  assert.equal(result.exploredNodes, MAX_EXPLORED_NODES);
});

test('routing failures and invalid room/connector references have different statuses', () => {
  assert.deepEqual(resolveConnectionRoute({ ...connection, fromRoomId: 'missing' }, endpoints()), { status: 'invalid', route: null });
  const rooms = [...endpoints(), placed('c', 7, 0)];
  const geometry = connectionGeometry(connection, rooms)!;
  const result = obstacleAvoidingRouter(geometry, createOccupancyGrid(rooms), { maxExploredNodes: 0 });
  assert.equal(result.status, 'limit-exceeded');
});

test('unblocked layout recovers after a failed search; room rotations change occupancy and routes', () => {
  const obstacle = placed('c', 4, 0, DEFAULT_PIECES[1]);
  assert.equal(resolveConnectionRoute(connection, [...endpoints(), obstacle]).status, 'unreachable');
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const rooms = [...endpoints(), { ...obstacle, position: { x: 8, y: 0 }, rotation }];
    assertSafe(resolveConnectionRoute(connection, rooms), connectionGeometry(connection, rooms)!, rooms);
  }
});

const state = () => useDungeonStore.getState();
function setup() {
  state().newDungeon();
  endpoints().forEach(room => state().addRoom(room));
  state().addConnection({ roomId: 'a', connectorId: connection.fromConnectorId },
    { roomId: 'b', connectorId: connection.toConnectorId }, 'secret');
  return state().dungeon.connections[0];
}
const current = (c: Connection) => resolveConnectionRoute(c, state().dungeon.rooms);

test('third-room add/move/rotate/delete and connection edits restore their routes through undo/redo', () => {
  const c = setup();
  const original = current(c);
  state().addRoom(placed('c', 7, 0, DEFAULT_PIECES[2]));
  const added = current(c);
  assert.notDeepEqual(added, original);
  state().rotateRoom('c');
  const rotated = current(c);
  state().moveRoom('c', { x: 7, y: 7 });
  const moved = current(c);
  assert.deepEqual(moved, original);
  state().undo(); assert.deepEqual(current(c), rotated);
  state().undo(); assert.deepEqual(current(c), added);
  state().undo(); assert.deepEqual(current(c), original);
  state().redo(); assert.deepEqual(current(c), added);
  state().deleteRoom('c'); assert.deepEqual(current(c), original);
  state().undo(); assert.deepEqual(current(c), added);
  state().deleteConnection(c.id); assert.equal(state().dungeon.connections.length, 0);
  state().undo(); assert.deepEqual(current(c), added);
  state().redo(); assert.equal(state().dungeon.connections.length, 0);
  state().undo();
  state().deleteRoom('a'); assert.equal(state().dungeon.connections.length, 0);
  state().undo(); assert.deepEqual(current(c), added);
});

test('one shared occupancy grid routes a batch without rebuilding it per connection', () => {
  const rooms = [...endpoints(), placed('c', 7, 0)];
  const grid = createOccupancyGrid(rooms);
  const batch = routeConnections([connection, { ...connection, id: 'reverse', fromRoomId: 'b',
    fromConnectorId: connection.toConnectorId, toRoomId: 'a', toConnectorId: connection.fromConnectorId }], rooms, grid);
  assert.equal(batch.size, 2);
  for (const [id, result] of batch) assert.equal(result.status, 'success', id);
});

function assertNoDerivedData(dungeon: DungeonDocument) {
  assert.ok(!/"(?:route|points|segments|path|waypoints|grid|occupancy|exploredNodes|status|fallback)"\s*:/.test(JSON.stringify(dungeon)));
}

test('JSON and IndexedDB restore avoided routes without persisting occupancy, paths or failure states', async () => {
  const c = setup();
  state().addRoom(placed('c', 7, 0));
  const expected = current(c);
  assert.equal(expected.status, 'success');
  const before = structuredClone(state().dungeon);
  const exported = buildExportEnvelope(before);
  assert.equal(exported.schemaVersion, '1.1.0');
  const imported = parseImport(JSON.parse(JSON.stringify(exported))).dungeon;
  assert.deepEqual(resolveConnectionRoute(c, imported.rooms), expected);
  await dungeonRepository.saveMainEditorSnapshot(before);
  const loaded = await dungeonRepository.load(before.id);
  assert.ok(loaded);
  assert.deepEqual(resolveConnectionRoute(c, loaded.rooms), expected);
  assert.deepEqual(state().dungeon, before);
  assertNoDerivedData(loaded);
  assertNoDerivedData(imported);
  state().undoStack.forEach(assertNoDerivedData);
  state().moveRoom('c', { x: 4, y: 0 });
  assert.equal(current(c).status, 'unreachable');
  await dungeonRepository.saveMainEditorSnapshot(state().dungeon);
  const failedLoaded = await dungeonRepository.load(before.id);
  assert.ok(failedLoaded);
  assert.equal(resolveConnectionRoute(c, failedLoaded.rooms).status, 'unreachable');
  assert.equal(failedLoaded.connections.length, 1);
  assertNoDerivedData(failedLoaded);
});

after(async () => { await db.delete(); });
