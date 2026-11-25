import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import type { Connection, ConnectorDirection, PlacedRoom, Rotation } from '../src/model/types';
import { connectionGeometry } from '../src/editor/connectors/connectionGeometry';
import type { ConnectionGeometry } from '../src/editor/connectors/connectionGeometry';
import { routeConnection } from '../src/editor/connectors/routing/connectionRouter';
import type { ConnectionRoute, RoutePoint } from '../src/editor/connectors/routing/connectionRouter';
import { orthogonalRouter } from '../src/editor/connectors/routing/orthogonalRouter';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';

const directions: ConnectorDirection[] = ['east', 'west', 'north', 'south'];
const vectors = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
const offsets = [
  [10, 6], [-10, 6], [10, -6], [-10, -6], [0, 6], [6, 0], [-6, 0],
  [0, -6], [0, 0], [0.5, 0.5], [0.5, 0], [0, 0.5], [-0.5, -0.5],
];

function assertRoute(route: ConnectionRoute, geometry: ConnectionGeometry) {
  const { points } = route;
  assert.ok(points.length >= 2);
  assert.deepEqual(points[0], geometry.from.position);
  assert.deepEqual(points.at(-1), geometry.to.position);
  const legs: RoutePoint[] = [];
  for (let index = 1; index < points.length; index++) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    assert.ok(Number.isFinite(points[index].x) && Number.isFinite(points[index].y));
    assert.ok((dx === 0) !== (dy === 0), 'Each leg must be nonzero and horizontal or vertical');
    const previous = legs.at(-1);
    if (previous) assert.ok(previous.x * dx + previous.y * dy >= 0, 'No immediate U-turn');
    legs.push({ x: dx, y: dy });
  }
  const [fromX, fromY] = vectors[geometry.from.direction];
  const [toX, toY] = vectors[geometry.to.direction];
  assert.ok(legs[0].x * fromX + legs[0].y * fromY > 0, 'First leg leaves outward');
  assert.ok(legs.at(-1)!.x * toX + legs.at(-1)!.y * toY < 0, 'Last leg enters from outside');
}

for (const fromDirection of directions) {
  for (const toDirection of directions) {
    test(`${fromDirection} -> ${toDirection}: orthogonal exits for all relative placements`, () => {
      for (const [dx, dy] of offsets) {
        const geometry: ConnectionGeometry = {
          from: { position: { x: -3, y: 1.5 }, direction: fromDirection },
          to: { position: { x: -3 + dx, y: 1.5 + dy }, direction: toDirection },
        };
        const before = structuredClone(geometry);
        const route = orthogonalRouter(geometry);
        assertRoute(route, geometry);
        assert.deepEqual(orthogonalRouter(geometry), route, 'Routing is deterministic');
        assert.deepEqual(geometry, before, 'Routing does not mutate geometry');
        route.points[0].x += 100;
        assert.deepEqual(geometry, before, 'Route points are detached from geometry');
      }
    });
  }
}

test('facing aligned points simplify to a straight segment and perpendicular points form an L', () => {
  assert.equal(orthogonalRouter({
    from: { position: { x: 0, y: 0 }, direction: 'east' },
    to: { position: { x: 8, y: 0 }, direction: 'west' },
  }).points.length, 2);
  assert.equal(orthogonalRouter({
    from: { position: { x: 0, y: 0 }, direction: 'east' },
    to: { position: { x: 8, y: 4 }, direction: 'north' },
  }).points.length, 3);
  assert.equal(orthogonalRouter({
    from: { position: { x: 0, y: 0 }, direction: 'east' },
    to: { position: { x: 8, y: 4 }, direction: 'west' },
  }).points.length, 4);
});

const state = () => useDungeonStore.getState();
const square = DEFAULT_PIECES[0];
function placed(id: string, x: number, y: number, piece = square): PlacedRoom {
  return { id, pieceId: piece.id, piece, position: { x, y }, rotation: 0 };
}
function setup() {
  state().newDungeon();
  state().addRoom(placed('a', 1, 2));
  state().addRoom(placed('b', 12, 8));
  state().addConnection({ roomId: 'a', connectorId: square.connectors[2].id },
    { roomId: 'b', connectorId: square.connectors[3].id }, 'secret');
  return state().dungeon.connections[0];
}
function currentRoute(connection: Connection) {
  const geometry = connectionGeometry(connection, state().dungeon.rooms);
  const route = routeConnection(connection, state().dungeon.rooms);
  assert.ok(geometry && route);
  assertRoute(route, geometry);
  return route;
}

test('room movement in both axes regenerates routes, including undo/redo', () => {
  const connection = setup();
  const initial = currentRoute(connection);
  state().moveRoom('b', { x: 16, y: 8 });
  const horizontal = currentRoute(connection);
  assert.notDeepEqual(horizontal, initial);
  state().moveRoom('b', { x: 16, y: 12 });
  const vertical = currentRoute(connection);
  assert.notDeepEqual(vertical, horizontal);
  state().undo();
  assert.deepEqual(currentRoute(connection), horizontal);
  state().undo();
  assert.deepEqual(currentRoute(connection), initial);
  state().redo();
  assert.deepEqual(currentRoute(connection), horizontal);
  state().redo();
  assert.deepEqual(currentRoute(connection), vertical);
  assert.deepEqual(state().dungeon.connections, [connection]);
});

test('all room rotations regenerate routes using the rotated outward direction', () => {
  const connection = setup();
  const expected: ConnectorDirection[] = ['east', 'south', 'west', 'north'];
  let previous: ConnectionRoute | null = null;
  for (const direction of expected) {
    const geometry = connectionGeometry(connection, state().dungeon.rooms)!;
    assert.equal(geometry.from.direction, direction);
    const route = currentRoute(connection);
    if (previous) assert.notDeepEqual(route, previous);
    previous = route;
    state().rotateRoom('a');
  }
  const afterFullTurn = currentRoute(connection);
  state().undo();
  assert.deepEqual(currentRoute(connection), previous);
  state().redo();
  assert.deepEqual(currentRoute(connection), afterFullTurn);
  assert.deepEqual(state().dungeon.connections, [connection]);
});

for (const [index, expected] of [
  [1, [{ x: 5.5, y: 4 }, { x: 6, y: 6.5 }, { x: 6.5, y: 7 }, { x: 3, y: 7.5 }]],
  [2, [{ x: 3.5, y: 4 }, { x: 7, y: 4.5 }, { x: 6.5, y: 8 }, { x: 3, y: 7.5 }]],
] as const) {
  test(`${DEFAULT_PIECES[index].shape}: route follows connector position/direction at all rotations`, () => {
    const piece = DEFAULT_PIECES[index];
    const room = placed('a', 3, 4, piece);
    const target = placed('b', 30, 20);
    const connection: Connection = {
      id: 'transformed', fromRoomId: 'a', fromConnectorId: piece.connectors[0].id,
      toRoomId: 'b', toConnectorId: square.connectors[3].id, type: 'corridor',
    };
    ([0, 90, 180, 270] as Rotation[]).forEach((rotation, turn) => {
      const rooms = [{ ...room, rotation }, target];
      const geometry = connectionGeometry(connection, rooms)!;
      assert.deepEqual(geometry.from.position, expected[turn]);
      assert.equal(geometry.from.direction, ['north', 'east', 'south', 'west'][turn]);
      const route = routeConnection(connection, rooms)!;
      assertRoute(route, geometry);
    });
  });
}

test('missing room/connector references return no route, and router implementations are replaceable', () => {
  const connection = setup();
  assert.equal(routeConnection({ ...connection, fromRoomId: 'missing' }, state().dungeon.rooms), null);
  assert.equal(routeConnection({ ...connection, toConnectorId: 'missing' }, state().dungeon.rooms), null);
  let received: ConnectionGeometry | null = null;
  const replacement: ConnectionRoute = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
  assert.equal(routeConnection(connection, state().dungeon.rooms, geometry => {
    received = geometry;
    return replacement;
  }), replacement);
  assert.deepEqual(received, connectionGeometry(connection, state().dungeon.rooms));
});

test('route data stays out of documents, JSON and undo/redo snapshots', () => {
  const connection = setup();
  state().moveRoom('b', { x: 15, y: 8 });
  state().rotateRoom('a');
  state().undo();
  const before = structuredClone(state().dungeon);
  const undo = structuredClone(state().undoStack);
  const redo = structuredClone(state().redoStack);
  const route = currentRoute(connection);
  assert.deepEqual(state().dungeon, before);
  assert.deepEqual(state().undoStack, undo);
  assert.deepEqual(state().redoStack, redo);
  const exported = buildExportEnvelope(state().dungeon);
  const json = JSON.stringify(exported);
  assert.equal(exported.schemaVersion, '1.1.0');
  assert.ok(!/"(?:route|points|segments|path|waypoints)"\s*:/.test(json));
  assert.ok(!/"(?:route|points|segments|path|waypoints)"\s*:/.test(JSON.stringify([undo, redo])));
  const imported = parseImport(JSON.parse(json)).dungeon;
  assert.deepEqual(routeConnection(imported.connections[0], imported.rooms), route);
});

test('IndexedDB insert/update/reload regenerates the same route from logical data', async () => {
  const connection = setup();
  await dungeonRepository.saveMainEditorSnapshot(state().dungeon);
  state().moveRoom('b', { x: 20, y: 15 });
  state().rotateRoom('a');
  const expected = currentRoute(connection);
  await dungeonRepository.saveMainEditorSnapshot(state().dungeon);
  const stored = await db.dungeons.get(state().dungeon.id);
  assert.ok(stored);
  assert.ok(!/"(?:route|points|segments|path|waypoints)"\s*:/.test(JSON.stringify(stored)));
  const loaded = await dungeonRepository.load(stored.id);
  assert.ok(loaded);
  assert.deepEqual(routeConnection(loaded.connections[0], loaded.rooms), expected);
});

after(async () => { await db.delete(); });
