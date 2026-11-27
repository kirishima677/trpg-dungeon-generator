import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Connection, DungeonDocument, Piece, PlacedRoom, Rotation } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import { defaultPublishProfile, validatePublishProfile } from '../src/publishing/publishProfile';
import { buildPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { DRAWING_MARGIN_CELLS, mapBounds } from '../src/publishing/mapBounds';
import { renderPublishSvg } from '../src/publishing/PublishMapRenderer';
import { exportFilename, MAX_CANVAS_PIXELS, svgToPng, validatePngDimensions } from '../src/publishing/exporters';
import type { PngEnvironment } from '../src/publishing/exporters';
import { createSnapshotProvider, isPublishSnapshot } from '../src/publishing/snapshotChannel';
import { cellShapes } from '../src/editor/connectors/corridor/cellShapes';
import { corridorWalls } from '../src/editor/connectors/corridor/corridorShape';
import { roomLabelLayout } from '../src/editor/rooms/roomLabel';
import { getWorldCells } from '../src/utils/geometry';
import { db } from '../src/db/db';
import { useDungeonStore } from '../src/store/dungeonStore';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';

const room = (id: string, x = 0, y = 0, piece = DEFAULT_PIECES[0]): PlacedRoom => ({ id, pieceId: piece.id, piece: structuredClone(piece),
  position: { x, y }, rotation: 0, information: { ...emptyRoomInformation('01'), name: '日本語の礼拝堂', gmNotes: 'PRIVATE_NOTE', description: 'PRIVATE_DESCRIPTION', tags: ['PRIVATE_TAG'] } });
const link = (id: string, a: string, b: string, from = 'east', to = 'west', type: Connection['type'] = 'corridor'): Connection => ({ id,
  fromRoomId: a, toRoomId: b, fromConnectorId: `piece-rect-4x4-${from}`, toConnectorId: `piece-rect-4x4-${to}`, type });
const dungeon = (rooms = [room('a'), room('b', 12)], connections = [link('normal', 'a', 'b')]): DungeonDocument => ({ id: 'PRIVATE_DUNGEON_ID',
  name: '古城', version: '1.2.0', rooms, connections, markdown: 'PRIVATE_MARKDOWN', meta: { gridSize: 40, background: 'PRIVATE_BACKGROUND' }, createdAt: '', updatedAt: '' });
const geometry = (source = dungeon(), audience: 'gm' | 'player' = 'player') => buildPublishMapGeometry(buildPublishDocument(source, audience));
const paths = (d: string) => d.split(/(?=M )/).map(v => v.trim()).filter(Boolean);
after(async () => { await db.delete(); });

test('publication defaults isolate player labels and preserve explicit profile options', () => {
  assert.deepEqual(defaultPublishProfile('player'), { audience: 'player', showGrid: true, showRoomNumbers: false, showRoomNames: false, background: 'white', pixelsPerCell: 64, paddingCells: 2 });
  const gm = defaultPublishProfile('gm'); assert.equal(gm.showRoomNumbers, true); assert.equal(gm.showRoomNames, true);
  for (const background of ['white', 'transparent'] as const) for (const pixelsPerCell of [1, 32, 64, 128, 512]) {
    validatePublishProfile({ ...gm, showGrid: false, showRoomNames: false, showRoomNumbers: false, background, pixelsPerCell, paddingCells: 0.5 });
  }
});
test('invalid profiles reject nonfinite, fractional resolution and unsupported options', () => {
  for (const patch of [{ audience: 'other' }, { background: 'red' }, { pixelsPerCell: NaN }, { pixelsPerCell: Infinity }, { pixelsPerCell: 0 },
    { pixelsPerCell: 513 }, { pixelsPerCell: 1.5 }, { paddingCells: -1 }, { paddingCells: Infinity }, { paddingCells: 101 }, { showGrid: 0 }, { showRoomNames: 'yes' }]) {
    assert.throws(() => validatePublishProfile({ ...defaultPublishProfile(), ...patch } as never));
  }
});
test('allowlisted documents remove private fields, source IDs, unused secret connectors and aliases', () => {
  const source = dungeon(); source.rooms[0].id = 'PRIVATE_ROOM'; source.connections[0].fromRoomId = 'PRIVATE_ROOM';
  source.rooms[0].piece.tags = ['PRIVATE_PIECE_TAG'];
  source.rooms.push(room('hidden-destination', 0, 12));
  source.connections.push(link('PRIVATE_SECRET_ID', 'PRIVATE_ROOM', 'hidden-destination', 'south', 'north', 'secret'));
  const before = structuredClone(source), pub = buildPublishDocument(source, 'player');
  assert.equal(pub.rooms.length, 3); assert.equal(pub.connections.length, 1);
  assert.doesNotMatch(JSON.stringify(pub), /PRIVATE_|gmNotes|markdown|description|tags|secret/);
  assert.equal(pub.rooms[0].piece.connectors.length, 1);
  assert.deepEqual(source, before);
  pub.rooms[0].piece.cells[0].x = 99; pub.rooms[0].position.x = 99;
  assert.deepEqual(source, before);
  assert.equal(buildPublishDocument(source, 'gm').connections.length, 2);
});
test('invalid Piece definitions and included references fail instead of producing incomplete maps', () => {
  for (const mutate of [
    (d: DungeonDocument) => { d.rooms[0].pieceId = 'missing'; },
    (d: DungeonDocument) => { d.rooms[0].piece = undefined as never; },
    (d: DungeonDocument) => { d.rooms[0].piece.cells = []; },
    (d: DungeonDocument) => { d.rooms[0].rotation = 45 as Rotation; },
    (d: DungeonDocument) => { d.rooms[0].position.x = Infinity; },
    (d: DungeonDocument) => { d.connections[0].fromConnectorId = 'missing'; },
    (d: DungeonDocument) => { d.connections[0].toRoomId = 'missing'; },
  ]) { const d = dungeon(); mutate(d); assert.throws(() => geometry(d)); }
  const secret = dungeon(); secret.connections[0].type = 'secret'; secret.connections[0].fromConnectorId = 'missing';
  assert.equal(geometry(secret).unresolvedCount, 0); assert.throws(() => geometry(secret, 'gm'));
});
test('secret exclusion restores closed room boundaries and leaves no floor or route overlay', () => {
  const source = dungeon(); source.connections[0].type = 'secret';
  const player = geometry(source), gm = geometry(source, 'gm');
  assert.equal(player.scene.network.cells.length, 0); assert.equal(player.overlays.length, 0); assert.equal(gm.overlays.length, 1);
  assert.equal(player.scene.openConnectorIds.size, 0);
  assert.ok(player.rooms[0].shapes.walls.some(w => w.d === 'M 160 40 L 160 80'));
  const svg = renderPublishSvg(player, defaultPublishProfile()).svg;
  assert.doesNotMatch(svg, /#7c3aed|stroke-dasharray|PRIVATE_|data-|<script|<title|<desc|display:none|opacity=/);
});
test('normal/secret overlap and crossing preserve public floors, masks and openings', () => {
  const rooms = [room('left', -8, 0), room('right', 8, 0), room('top', 0, -8), room('bottom', 0, 8)];
  const normal = link('a', 'left', 'right'), cross = link('b', 'top', 'bottom', 'south', 'north', 'secret');
  const overlap = { ...normal, id: 'c', type: 'secret' as const };
  const source = dungeon(rooms, [normal, cross, overlap]);
  const p = geometry(source), g = geometry(source, 'gm'), baseline = geometry(dungeon(rooms, [normal]));
  const physical = (v: typeof p) => v.scene.network.cells.map(({ x, y, connections }) => ({ x, y, connections }));
  assert.deepEqual(physical(p), physical(g)); assert.deepEqual(physical(p), physical(baseline));
  assert.deepEqual(p.rooms.map(r => r.shapes), baseline.rooms.map(r => r.shapes));
  assert.equal(p.overlays.length, 0); assert.equal(g.overlays.length, 2);
});
test('routing and shared network are reused for crosses, turns, T junctions and overlapping routes', () => {
  const rooms = [room('left', -8, 0), room('right', 8, 0), room('top', 0, -8), room('bottom', 0, 8)];
  const links = [link('a', 'left', 'right'), link('b', 'top', 'bottom', 'south', 'north')];
  const cross = geometry(dungeon(rooms, links));
  assert.ok(cross.scene.network.cells.some(c => c.connections === 15));
  assert.equal(cross.unresolvedCount, 0);
  const shared = geometry(dungeon(rooms, [...links, { ...links[0], id: 'duplicate' }]));
  assert.equal(shared.corridor.floors.length, cross.corridor.floors.length);
  assert.equal(shared.corridor.grid, cross.corridor.grid);
  assert.equal(new Set(paths(shared.corridor.grid)).size, paths(shared.corridor.grid).length);
  const turning = geometry(dungeon([room('a'), room('b', 12, 8)]));
  assert.ok(turning.scene.network.cells.some(c => [3, 6, 9, 12].includes(c.connections)));
  const t = geometry(dungeon(rooms, [links[0], link('t', 'top', 'right', 'south', 'west')]));
  assert.ok(t.scene.network.cells.some(c => [7, 11, 13, 14].includes(c.connections)));
});
test('successful ordinary corridors open both room walls, including adjacent direct joins', () => {
  for (const x of [4, 12]) {
    const g = geometry(dungeon([room('a'), room('b', x)]));
    assert.equal(g.unresolvedCount, 0); assert.equal(g.scene.openConnectorIds.size, 2);
    assert.ok(!g.rooms[0].shapes.walls.some(w => w.d === 'M 160 40 L 160 80'));
    assert.ok(!g.rooms[1].shapes.walls.some(w => w.d === `M ${x * 40} 40 L ${x * 40} 80`));
  }
});
test('unreachable and bounded routes warn; player files never contain failure lines or false openings', () => {
  for (const source of [dungeon([room('a'), room('b', 12), room('block', 4, 0)]), dungeon([room('a'), room('b', 600), room('obstacle', 100)])]) {
    const p = geometry(source), g = geometry(source, 'gm');
    assert.equal(p.unresolvedCount, 1); assert.equal(g.unresolvedCount, 1);
    assert.equal(p.scene.network.cells.length, 0); assert.equal(p.scene.openConnectorIds.size, 0);
    assert.equal(p.overlays.length, 0); assert.equal(g.overlays.length, 1);
    assert.doesNotMatch(renderPublishSvg(p, defaultPublishProfile()).svg, /#dc2626/);
    assert.match(renderPublishSvg(g, defaultPublishProfile('gm')).svg, /#dc2626/);
    source.connections[0].type = 'secret'; assert.equal(geometry(source).unresolvedCount, 0);
  }
});
test('bounds cover negative, distant and rotated custom/L/manual pieces with stroke margin and padding', () => {
  const ring: Piece = { id: 'custom-ring', name: '輪', shape: 'custom', connectors: [], cells: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 } ] };
  for (const piece of [...DEFAULT_PIECES, ring]) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const placed = { ...room('one', -17, -9, piece), rotation };
    const g = geometry(dungeon([placed], [])), cells = getWorldCells(placed), b = mapBounds(g, 2), anchor = roomLabelLayout(cells)!;
    assert.equal(b.minX, Math.min(...cells.map(c => c.x)) - 2 - DRAWING_MARGIN_CELLS);
    assert.ok(Math.abs(b.maxY - (Math.max(...cells.map(c => c.y)) + 1 + 2 + DRAWING_MARGIN_CELLS)) < 1e-9);
    assert.ok(cells.some(c => c.x === Math.floor(anchor.x) && c.y === Math.floor(anchor.y)));
    assert.doesNotMatch(renderPublishSvg(g, { ...defaultPublishProfile(), showRoomNames: true }).svg, /rotate\(/);
  }
  const empty = renderPublishSvg(geometry(dungeon([], [])), defaultPublishProfile());
  assert.ok(empty.width > 0 && empty.height > 0);
  const distant = geometry(dungeon([room('a', -100), room('b', 200)], [])); assert.ok(mapBounds(distant, 0).maxX >= 204);
});
test('excluded secret detours do not expand public bounds', () => {
  const source = dungeon([room('a'), room('b', 12)]); source.connections[0].type = 'secret';
  // Force the route well outside the rooms with a third occupied block.
  source.rooms.push(room('obstacle', 4, -2, DEFAULT_PIECES[0]));
  const p = geometry(source), baseline = geometry({ ...source, connections: [] });
  assert.deepEqual(mapBounds(p, 2), mapBounds(baseline, 2));
  assert.equal(p.scene.drawings.length, 0);
});
test('standalone SVG uses identical geometry for visual profiles and keeps external walls when grid is off', () => {
  const g = geometry(), before = structuredClone(g.scene.network);
  for (const showGrid of [true, false]) for (const showRoomNumbers of [true, false]) for (const showRoomNames of [true, false]) {
    const result = renderPublishSvg(g, { ...defaultPublishProfile(), showGrid, showRoomNumbers, showRoomNames });
    assert.match(result.svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(result.svg, /viewBox=/); assert.match(result.svg, /width="\d+" height="\d+"/);
    assert.match(result.svg, /stroke-width="2"/);
    assert.equal(result.svg.includes('stroke-width="1.5"'), showGrid);
    assert.equal(result.svg.includes('日本語の礼拝堂'), showRoomNames);
    assert.equal(result.svg.includes('>01</text>'), showRoomNumbers);
    assert.doesNotMatch(result.svg, /data-|<title|<desc|<script|onclick|tabindex|role=|url\(|class=|PRIVATE_/);
    assert.deepEqual(g.scene.network, before);
  }
  assert.throws(() => renderPublishSvg(g, defaultPublishProfile('gm')));
});
test('white and transparent backgrounds, safe labels and output pixel scale are applied to the same SVG', () => {
  const source = dungeon(); source.rooms[0].information.name = '<script>危険 & "引用"</script>';
  const g = geometry(source);
  const white = renderPublishSvg(g, { ...defaultPublishProfile(), showRoomNames: true });
  const transparent = renderPublishSvg(g, { ...defaultPublishProfile(), background: 'transparent' });
  assert.match(white.svg, /fill="white"/); assert.doesNotMatch(transparent.svg, /<rect/);
  assert.doesNotMatch(white.svg, /<script>/); assert.match(white.svg, /&lt;script&gt;/);
  for (const pixelsPerCell of [32, 64, 128, 73]) {
    const output = renderPublishSvg(g, { ...defaultPublishProfile(), pixelsPerCell });
    assert.equal(output.width, Math.ceil((output.bounds.maxX - output.bounds.minX) * pixelsPerCell));
    assert.equal(output.height, Math.ceil((output.bounds.maxY - output.bounds.minY) * pixelsPerCell));
  }
});
test('shared shape helper preserves masks rather than opening merely adjacent corridors', () => {
  const cells = [{ x: 0, y: 0, connections: 5 }, { x: 1, y: 0, connections: 5 }];
  const shapes = cellShapes(cells);
  assert.equal(shapes.walls.length, 3); assert.equal(shapes.floors.length, 2);
  assert.ok(shapes.walls.some(w => w.d === 'M 40 0 L 40 40'));
  assert.equal(corridorWalls({ x: 0, y: 0, connections: 15 }).length, 0);
});
test('filenames sanitize path/control characters and keep audience explicit', () => {
  assert.equal(exportFilename('古城/地下:迷宮?\n', 'player', 'svg'), '古城_地下_迷宮__-player.svg');
  assert.equal(exportFilename('... ', 'gm', 'png'), 'dungeon-gm.png');
  assert.equal(exportFilename('x'.repeat(200), 'gm', 'png').length, 87);
});
test('PNG refuses dimension and total-pixel limits before allocating any image or canvas', async () => {
  validatePngDimensions(4096, 4096); assert.equal(MAX_CANVAS_PIXELS, 4096 ** 2);
  for (const [w, h] of [[8193, 1], [5000, 5000], [NaN, 4], [Infinity, 1], [0, 1], [-1, 1], [1.5, 1]]) {
    assert.throws(() => validatePngDimensions(w, h));
    await assert.rejects(svgToPng('<svg/>', w, h, 'transparent', { createImage: () => assert.fail('allocated image') } as never));
  }
});
function pngEnvironment(failure = '') {
  const events: unknown[] = [];
  const image = { onload: null, onerror: null, set src(value: string) {
    events.push(['src', value]); if (value) queueMicrotask(() => failure === 'image' ? this.onerror?.() : this.onload?.());
  } } as unknown as HTMLImageElement;
  const blob = new Blob(['PNG'], { type: 'image/png' });
  const canvas = { width: 0, height: 0,
    getContext: () => failure === 'context' ? null : { fillStyle: '', fillRect: (...args: unknown[]) => events.push(['fill', ...args]), drawImage: (...args: unknown[]) => { events.push(['draw', ...args.slice(1)]); if (failure === 'draw') throw Error('draw failed'); } },
    toBlob: (callback: BlobCallback, format: string) => { events.push(['encode', format]); if (failure === 'encode') throw Error('encode failed'); callback(failure === 'blob' ? null : blob); },
  } as unknown as HTMLCanvasElement;
  const environment: PngEnvironment = { fontsReady: Promise.resolve().then(() => events.push('fonts ready')), createImage: () => image,
    createCanvas: () => canvas, createUrl: input => { events.push(['url', input.type]); return 'blob:temporary'; }, revokeUrl: value => events.push(['revoke', value]) };
  return { environment, canvas, events, blob };
}
test('PNG waits for fonts, uses requested dimensions, encodes PNG and releases URLs/canvas', async () => {
  const { environment, canvas, events, blob } = pngEnvironment();
  assert.equal(await svgToPng('<svg/>', 512, 256, 'transparent', environment), blob);
  assert.equal(events[0], 'fonts ready'); assert.ok(events.some(e => JSON.stringify(e) === '["draw",0,0,512,256]'));
  assert.ok(events.some(e => JSON.stringify(e) === '["encode","image/png"]'));
  assert.deepEqual(events.at(-1), ['revoke', 'blob:temporary']); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
});
test('white PNG composites an opaque background before drawing; transparent PNG leaves alpha intact', async () => {
  for (const background of ['white', 'transparent'] as const) {
    const { environment, events } = pngEnvironment();
    await svgToPng('<svg/>', 512, 256, background, environment);
    const fill = events.findIndex(e => Array.isArray(e) && e[0] === 'fill');
    const draw = events.findIndex(e => Array.isArray(e) && e[0] === 'draw');
    assert.equal(fill >= 0, background === 'white');
    if (background === 'white') assert.ok(fill < draw);
  }
});
for (const failure of ['image', 'context', 'draw', 'blob', 'encode']) {
  test(`PNG ${failure} failure releases its URL and allocated canvas`, async () => {
    const { environment, canvas, events } = pngEnvironment(failure);
    await assert.rejects(svgToPng('<svg/>', 512, 256, 'transparent', environment));
    assert.deepEqual(events.at(-1), ['revoke', 'blob:temporary']); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
  });
}
test('launch snapshots are cloned, fixed, explicitly refreshed and isolated by dungeon/window identifiers', () => {
  const sent: unknown[] = [];
  const channel = { onmessage: null as BroadcastChannel['onmessage'], postMessage: (v: unknown) => sent.push(structuredClone(v)), close: () => sent.push('closed') };
  const provider = createSnapshotProvider('window-a', 'PRIVATE_DUNGEON_ID', channel);
  const d = dungeon(); provider.capture(d); d.rooms[0].position.x = 99;
  const request = (token: string, dungeonId: string) => channel.onmessage!.call(channel as never, { data: { type: 'request', token, dungeonId } } as MessageEvent);
  request('window-b', d.id); request('window-a', 'other-dungeon'); assert.equal(sent.length, 1);
  request('window-a', d.id); assert.equal(sent.length, 2);
  const latest = sent.at(-1); assert.ok(isPublishSnapshot(latest, 'window-a', d.id)); assert.equal(latest.document.rooms[0].position.x, 0);
  assert.equal(isPublishSnapshot(latest, 'window-b', d.id), false);
  provider.capture(d); const refreshed = sent.at(-1); assert.ok(isPublishSnapshot(refreshed, 'window-a', d.id)); assert.equal(refreshed.document.rooms[0].position.x, 99);
  assert.throws(() => provider.capture({ ...d, id: 'other' })); provider.close(); assert.equal(channel.onmessage, null);
});
test('publishing preserves repository, store/history, Markdown and schema 1.3 JSON roundtrip', async () => {
  const store = useDungeonStore.getState(); store.newDungeon(); store.addRoom(room('a')); store.addRoom(room('b', 12));
  const state = useDungeonStore.getState(), source = state.dungeon;
  await dungeonRepository.save(source);
  const savedBefore = await db.dungeons.toArray(), piecesBefore = await db.pieceLibrary.toArray();
  const undo = structuredClone(state.undoStack), redo = structuredClone(state.redoStack), before = structuredClone(source);
  for (const audience of ['gm', 'player'] as const) renderPublishSvg(geometry(source, audience), defaultPublishProfile(audience));
  assert.equal(useDungeonStore.getState().dungeon, source); assert.deepEqual(source, before);
  assert.deepEqual(useDungeonStore.getState().undoStack, undo); assert.deepEqual(useDungeonStore.getState().redoStack, redo);
  assert.deepEqual(await db.dungeons.toArray(), savedBefore); assert.deepEqual(await db.pieceLibrary.toArray(), piecesBefore);
  const envelope = buildExportEnvelope(source); assert.equal(envelope.schemaVersion, '1.4.0');
  assert.deepEqual(parseImport(JSON.parse(JSON.stringify(envelope))).dungeon, source);
});
