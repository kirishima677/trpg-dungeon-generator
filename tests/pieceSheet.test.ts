import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DungeonDocument, Piece, PlacedRoom, Connection } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import { buildDungeonInventory, buildLibraryInventory, buildCorridorInventory, classifyPiece, corridorTileCounts,
  normalizeCorridorMask, withPrintQuantities, defaultPieceSheetOptions, MAX_INVENTORY_ITEMS } from '../src/publishing/pieceSheet/inventory';
import { buildPrintablePiece } from '../src/publishing/pieceSheet/artwork';
import { buildPieceSheetLayout, pieceFootprint, validatePieceSheetLayout } from '../src/publishing/pieceSheet/layout';
import { renderPieceSheetDocument } from '../src/publishing/pieceSheet/renderer';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { buildPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { renderPublishSvg } from '../src/publishing/PublishMapRenderer';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { db } from '../src/db/db';
import { pieceRepository } from '../src/repository/pieceRepository';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';

const options = () => defaultPieceSheetOptions();
const profile = () => defaultPrintProfile(); // The shared profile may still target a guide.
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const room = (id: string, x = 0, y = 0, piece = DEFAULT_PIECES[0], rotation: PlacedRoom['rotation'] = 0): PlacedRoom => ({
  id, pieceId: piece.id, piece: structuredClone(piece), position: { x, y }, rotation, information: emptyRoomInformation(id) });
const link = (id: string, a: string, b: string, from = 'east', to = 'west', type: Connection['type'] = 'corridor'): Connection => ({
  id, fromRoomId: a, toRoomId: b, fromConnectorId: `piece-rect-4x4-${from}`, toConnectorId: `piece-rect-4x4-${to}`, type });
const dungeon = (rooms = [room('a'), room('b', 12)], connections = [link('normal', 'a', 'b')]): DungeonDocument => ({
  id: 'PRIVATE_PROJECT_ID', name: 'PRIVATE_PROJECT_NAME', version: '1.2.0', rooms, connections, markdown: 'PRIVATE_MARKDOWN',
  meta: { gridSize: 40 }, createdAt: '', updatedAt: '' });
const selected = (pieces = DEFAULT_PIECES, quantity = 1) => buildLibraryInventory(pieces).items.map(i => ({ ...i, printQuantity: quantity }));
after(async () => { await db.delete(); });

for (const [canonical, masks] of [[10, [10, 5]], [3, [3, 6, 12, 9]], [11, [11, 7, 14, 13]], [15, [15]], [1, [1, 2, 4, 8]]] as const) {
  for (const mask of masks) test(`corridor mask ${mask} normalizes by rotation to ${canonical}`, () => assert.equal(normalizeCorridorMask(mask), canonical));
}
test('invalid masks and cell positions fail rather than silently omitting material', () => {
  for (const mask of [0, -1, 16, 1.5, NaN, Infinity]) assert.throws(() => normalizeCorridorMask(mask));
  assert.throws(() => corridorTileCounts([{ x: 0.5, y: 0, connections: 10 }]));
});
test('merged coordinates OR connections once for crosses, T junctions and shared straights', () => {
  const counts = corridorTileCounts([{ x: 0, y: 0, connections: 10 }, { x: 0, y: 0, connections: 5 },
    { x: 1, y: 0, connections: 10 }, { x: 1, y: 0, connections: 10 },
    { x: 2, y: 0, connections: 3 }, { x: 2, y: 0, connections: 8 }]);
  assert.deepEqual([...counts], [[15, 1], [10, 1], [11, 1]]);
});
test('same Piece ID aggregates positions and rotations; distinct IDs and manual corridors stay distinct', () => {
  const custom = { ...structuredClone(DEFAULT_PIECES[0]), id: 'custom', name: '自由形状', shape: 'custom' as const, tags: ['room'] };
  const source = dungeon([room('a'), room('b', 10, 3, DEFAULT_PIECES[0], 90), room('c', 20, 2, custom), room('d', 30, 0, DEFAULT_PIECES[3])], []);
  const before = structuredClone(source), inv = buildDungeonInventory(source, 'player');
  assert.equal(inv.items.length, 3);
  assert.equal(inv.items.find(i => i.pieceId === DEFAULT_PIECES[0].id)?.requiredQuantity, 2);
  assert.equal(inv.items.find(i => i.pieceId === custom.id)?.requiredQuantity, 1);
  assert.equal(inv.items.find(i => i.pieceId === DEFAULT_PIECES[3].id)?.category, 'manual-corridor');
  assert.deepEqual(source, before);
});
test('classification uses shape and explicit tags, never names', () => {
  const p = { ...DEFAULT_PIECES[0], shape: 'custom' as const, name: '通路 room', tags: [] };
  assert.equal(classifyPiece(p), 'other'); assert.equal(classifyPiece({ ...p, tags: ['room'] }), 'room');
  assert.equal(classifyPiece({ ...p, tags: ['corridor'] }), 'manual-corridor');
});
test('conflicting snapshots under one Piece ID fail', () => {
  const source = dungeon([room('a'), room('b', 12)], []);
  source.rooms[1].piece.connectors.pop();
  assert.throws(() => buildDungeonInventory(source, 'player'), /異なる形状/);
});
test('empty dungeon and direct connections produce no generated tiles', () => {
  assert.deepEqual(buildDungeonInventory(dungeon([], []), 'player'), { items: [], warnings: [] });
  const inv = buildDungeonInventory(dungeon([room('a'), room('b', 4)]), 'player');
  assert.equal(inv.items.filter(i => i.source === 'generated-corridor').length, 0);
  assert.deepEqual(inv.warnings, []);
});
test('actual crossing and overlapping routes count the network rather than individual routes', () => {
  const source = dungeon([room('left', 0, 6), room('right', 14, 6), room('top', 7, 0), room('bottom', 7, 14)],
    [link('horizontal', 'left', 'right'), link('vertical', 'top', 'bottom', 'south', 'north')]);
  const geometry = buildPublishMapGeometry(buildPublishDocument(source, 'player'));
  const inv = buildDungeonInventory(source, 'player', true, () => geometry);
  const generated = inv.items.filter(i => i.source === 'generated-corridor');
  assert.equal(generated.reduce((n, i) => n + i.requiredQuantity, 0), geometry.scene.network.cells.length);
  assert.ok(generated.some(i => i.corridorMask === 15 && i.requiredQuantity > 0));
});
test('secret connections are removed before routing/counting; special and failed connections warn', () => {
  const source = dungeon([room('a'), room('b', 12), room('c', 0, 12)],
    [link('normal', 'a', 'b'), link('PRIVATE_SECRET_ID', 'a', 'c', 'south', 'north', 'secret')]);
  const player = buildDungeonInventory(source, 'player'), gm = buildDungeonInventory(source, 'gm');
  assert.deepEqual(player.warnings, []); assert.match(gm.warnings.join(' '), /特殊接続が1件/);
  for (const type of ['door', 'stairs'] as const) assert.match(buildDungeonInventory(dungeon(undefined, [link(type, 'a', 'b', 'east', 'west', type)]), 'player').warnings.join(' '), /特殊接続/);
  const blocked = dungeon([room('a'), room('b', 12), room('block', 4, 0)]);
  const failed = buildDungeonInventory(blocked, 'player'); assert.match(failed.warnings.join(' '), /未解決/);
  assert.equal(failed.items.filter(i => i.source === 'generated-corridor').length, 0);
  assert.match(buildDungeonInventory(source, 'player', false).warnings.join(' '), /自動生成通路を除外/);
});
test('player secret ports disappear unless used by an included connection; no secret marks survive', () => {
  const source = dungeon(); source.rooms[0].piece.connectors.find(c => c.direction === 'east')!.kind = 'secret';
  // Keep one template ID structurally consistent.
  source.rooms[1].piece = structuredClone(source.rooms[0].piece);
  const inv = buildDungeonInventory(source, 'player');
  assert.ok(inv.items[0].piece.connectors.some(c => c.direction === 'east'));
  assert.ok(inv.items[0].piece.connectors.every(c => c.kind !== 'secret'));
});
test('library captures independent copies, quantities start unselected, tiles have five selectable forms', () => {
  const lib = structuredClone(DEFAULT_PIECES), inv = buildLibraryInventory(lib);
  assert.ok(inv.items.every(i => i.requiredQuantity === 0 && i.printQuantity === 0 && i.standard));
  lib[0].cells[0].x = 99; assert.ok(inv.items.every(i => i.piece.cells.every(c => c.x < 99)));
  assert.equal(buildCorridorInventory().items.length, 5);
  assert.throws(() => buildLibraryInventory([DEFAULT_PIECES[0], DEFAULT_PIECES[0]]), /重複/);
  assert.throws(() => buildLibraryInventory(Array(MAX_INVENTORY_ITEMS + 1).fill(DEFAULT_PIECES[0])), /種類/);
});
test('quantities allow zero, extras and shortages, reject invalid, per-item and total limits', () => {
  const base = buildDungeonInventory(dungeon(), 'player').items;
  const id = base[0].id;
  assert.equal(withPrintQuantities(base, { [id]: 0 })[0].printQuantity, 0);
  assert.equal(withPrintQuantities(base, { [id]: 4 })[0].printQuantity, 4);
  for (const value of [-1, 0.5, NaN, Infinity, 501]) assert.throws(() => withPrintQuantities(base, { [id]: value }));
  assert.throws(() => withPrintQuantities(selected(DEFAULT_PIECES, 500), {}), /合計/);
});
for (const cell of [15, 20, 25, 25.4, 30, 17.5]) test(`physical artwork dimensions and label/gap reserve at ${cell}mm`, () => {
  const items = selected([DEFAULT_PIECES[0]]), p = profile(); p.map.cellSizeMm = cell;
  const o = options(), f = pieceFootprint(items[0], 0, cell, o), layout = buildPieceSheetLayout(items, p, o), a = layout.pages[0].pieces[0];
  near(a.art.width, cell * 4); near(a.art.height, cell * 4);
  near(f.width - a.art.width, 3 + 3 * cell / 40); near(f.height - a.art.height, 11 + 3 * cell / 40);
  assert.deepEqual(validatePieceSheetLayout(layout, items, p, o), []);
});
test('90 degree rotation preserves custom shape and connector position/direction, labels stay outside art', () => {
  const piece: Piece = { id: 'wide', name: '横長', shape: 'custom', cells: Array.from({ length: 6 }, (_, x) => ({ x, y: 0 })),
    connectors: [{ id: 'e', position: { x: 5, y: 0 }, direction: 'east', width: 1, kind: 'open' }] };
  const items = selected([piece]), p = profile(); p.paperSize = 'A5';
  const o = options(), rotated = buildPieceSheetLayout(items, p, o);
  assert.equal(rotated.pages[0].pieces[0].rotation, 90);
  near(rotated.pages[0].pieces[0].art.height, 6 * 25.4);
  const shape = buildPrintablePiece(items[0], 90, o);
  assert.deepEqual(shape.connectors[0].worldPosition, { x: 0, y: 5 }); assert.equal(shape.connectors[0].worldDirection, 'south');
  const denied = buildPieceSheetLayout(items, p, { ...o, allowRotation: false });
  assert.equal(denied.unplacedPieces.length, 1); assert.equal(denied.pages.length, 0);
});
test('packing is deterministic, fits mixed pieces on multiple pages, separates categories if requested', () => {
  const items = selected(DEFAULT_PIECES, 5), p = profile(), o = options();
  const a = buildPieceSheetLayout(items, p, o), b = buildPieceSheetLayout(items, p, o);
  assert.deepEqual(a, b); assert.ok(a.pages.length > 1); assert.equal(a.totalPieces, 25);
  assert.deepEqual(validatePieceSheetLayout(a, items, p, o), []);
  const separate = { ...o, separateRoomsAndCorridors: true }, c = buildPieceSheetLayout(items, p, separate);
  assert.ok(c.pages.some(page => page.group === 'room')); assert.ok(c.pages.some(page => page.group === 'corridor'));
  assert.deepEqual(validatePieceSheetLayout(c, items, p, separate), []);
});
test('all paper sizes/orientations reuse asymmetric margins and maintain a uniform scale', () => {
  const items = buildCorridorInventory().items;
  for (const paperSize of ['A5', 'A4', 'A3', 'Letter'] as const) for (const orientation of ['portrait', 'landscape'] as const) {
    const p = { ...profile(), paperSize, orientation, marginsMm: { top: 7, right: 11, bottom: 13, left: 17 } };
    const layout = buildPieceSheetLayout(items, p, options());
    assert.deepEqual(validatePieceSheetLayout(layout, items, p, options()), []);
    layout.pages.forEach(page => page.pieces.forEach(piece => near(piece.art.width, 25.4)));
  }
});
test('oversized pieces are explicitly unplaced; full document cannot silently omit them', () => {
  const items = selected([DEFAULT_PIECES[0]]), p = profile(); p.map.cellSizeMm = 100;
  const layout = buildPieceSheetLayout(items, p, options()); assert.equal(layout.unplacedPieces.length, 1);
  assert.equal(layout.totalPieces, 1); assert.throws(() => renderPieceSheetDocument(items, layout, p, options()), /未配置/);
});
test('page limit is accounted for and blocks export without dropping requested instances', () => {
  const items = selected([DEFAULT_PIECES[0]], 101), p = profile(); p.paperSize = 'A5';
  const layout = buildPieceSheetLayout(items, p, options());
  assert.equal(layout.pages.length, 100); assert.equal(layout.unplacedPieces.length, 1);
  assert.equal(layout.unplacedPieces[0].reason, 'page-limit');
  assert.match(validatePieceSheetLayout(layout, items, p, options()).join(' '), /未配置/);
});
test('independent validator catches overlap, bounds, wrong scale/rotation, missing and duplicate instances', () => {
  const items = buildCorridorInventory().items, p = profile(), o = options(), layout = buildPieceSheetLayout(items, p, o);
  for (const mutate of [
    (l: typeof layout) => { l.pages[0].pieces[1] = structuredClone(l.pages[0].pieces[0]); },
    (l: typeof layout) => { l.pages[0].pieces[0].x = -1; },
    (l: typeof layout) => { l.pages[0].pieces[0].art.width *= 0.9; },
    (l: typeof layout) => { l.pages[0].pieces[0].rotation = 180 as never; },
    (l: typeof layout) => { l.pages[0].pieces.pop(); },
    (l: typeof layout) => { l.cellSizeMm = 25; },
  ]) { const tampered = structuredClone(layout); mutate(tampered); assert.ok(validatePieceSheetLayout(tampered, items, p, o).length); }
  const overlap = structuredClone(layout), [first, second] = overlap.pages[0].pieces;
  second.x = first.x; second.y = first.y; second.art.x = first.art.x; second.art.y = first.art.y;
  assert.ok(validatePieceSheetLayout(overlap, items, p, o).includes('素材同士が重なっています。'));
});
test('zero quantities remove instances, a thousand tiles remain complete, invalid geometry fails early', () => {
  const base = buildCorridorInventory().items, p = profile(), o = options();
  const zero = base.map(i => ({ ...i, printQuantity: 0 }));
  assert.equal(buildPieceSheetLayout(zero, p, o).totalPieces, 0);
  const many = base.map((i, n) => ({ ...i, printQuantity: n < 2 ? 500 : 0 }));
  const layout = buildPieceSheetLayout(many, p, o);
  assert.equal(layout.totalPieces, 1000); assert.equal(layout.pages.flatMap(page => page.pieces).length, 1000);
  assert.deepEqual(validatePieceSheetLayout(layout, many, p, o), []);
  const invalid = structuredClone(base); invalid[0].piece.cells = [];
  assert.throws(() => buildPieceSheetLayout(invalid, p, o), /床セル/);
});
for (const gap of [-1, 31, NaN, Infinity]) test(`invalid gap ${gap} is rejected`, () => {
  assert.throws(() => buildPieceSheetLayout(buildCorridorInventory().items, profile(), { ...options(), pieceGapMm: gap }));
});
test('cut lines follow concavity and inner holes even at ports; grid toggle keeps walls and physical cuts', () => {
  const hole: Piece = { id: 'ring', name: '輪', shape: 'custom', cells: Array.from({ length: 9 }, (_, n) => ({ x: n % 3, y: Math.floor(n / 3) })).filter(c => c.x !== 1 || c.y !== 1),
    connectors: [{ id: 'n', direction: 'north', kind: 'open', width: 1, position: { x: 0, y: 0 } }] };
  const item = selected([hole])[0], a = buildPrintablePiece(item, 0, options());
  assert.equal(a.cuts.length, 16); // 12 outside + 4 inside, includes the port boundary.
  assert.ok(a.cuts.some(c => c.y1 === 0 && c.y2 === 0 && c.x1 === 0));
  const noGrid = buildPrintablePiece(item, 0, { ...options(), showGrid: false });
  assert.doesNotMatch(noGrid.svg, /data-layer="grid"/); assert.match(noGrid.svg, /data-layer="walls"/); assert.match(noGrid.svg, /data-layer="cuts"/);
  assert.doesNotMatch(buildPrintablePiece(item, 0, { ...options(), showCutLines: false }).svg, /data-layer="cuts"/);
  assert.equal(buildPrintablePiece(selected([DEFAULT_PIECES[2]])[0], 90, options()).cuts.length, 16);
  for (const tile of buildCorridorInventory().items) assert.equal(buildPrintablePiece(tile, 0, options()).cuts.length, 4);
});
test('HTML/SVG allowlist excludes all dungeon secrets and original IDs; names are escaped', () => {
  const source = dungeon();
  for (const r of source.rooms) { r.information = { number: 'PRIVATE_NUMBER', name: 'PRIVATE_ROOM_NAME', description: 'PRIVATE_DESCRIPTION', gmNotes: 'PRIVATE_NOTES', tags: ['PRIVATE_TAG'] };
    r.piece.name = 'PRIVATE_PIECE_NAME'; r.piece.tags = ['PRIVATE_PIECE_TAG']; }
  const items = buildDungeonInventory(source, 'player').items, p = profile(), o = { ...options(), showConnectorMarks: true };
  const layout = buildPieceSheetLayout(items, p, o), html = renderPieceSheetDocument(items, layout, p, o);
  assert.doesNotMatch(html, /PRIVATE_|gmNotes|markdown|information|piece-rect-4x4|connection-/);
  assert.ok(items.every(i => !('tags' in i.piece)));
  const malicious = selected([{ ...DEFAULT_PIECES[0], name: '<script>alert(1)</script>' }]);
  const escaped = renderPieceSheetDocument(malicious, buildPieceSheetLayout(malicious, p, o), p, o);
  assert.doesNotMatch(escaped, /<script>/); assert.match(escaped, /&lt;script&gt;/);
});
test('HTML is standalone vector print output; one definition per orientation and one-page preview share positions', () => {
  const items = buildCorridorInventory().items.map(i => ({ ...i, printQuantity: 40 })), p = profile(), o = options();
  const layout = buildPieceSheetLayout(items, p, o), html = renderPieceSheetDocument(items, layout, p, o), preview = renderPieceSheetDocument(items, layout, p, o, 1);
  const dom = new JSDOM(html), small = new JSDOM(preview), doc = dom.window.document;
  assert.equal(doc.querySelectorAll('.print-sheet').length, layout.pages.length);
  assert.equal(doc.querySelectorAll('use').length, 200); assert.ok(doc.querySelectorAll('defs > g').length <= 10);
  const ids = [...doc.querySelectorAll('[id]')].map(n => n.id); assert.equal(ids.length, new Set(ids).size);
  assert.equal(small.window.document.querySelector('.print-sheet')?.outerHTML, doc.querySelectorAll('.print-sheet')[1].outerHTML);
  assert.equal(doc.querySelectorAll('script, img, a').length, 0);
  assert.ok(doc.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  assert.match(html, /width="25.4mm"/); assert.match(html, /\.print-sheet:last-child \{ break-after: auto/);
  assert.match(html, /100%/); assert.match(html, /@page \{ size: 210mm 297mm/);
  dom.window.close(); small.window.close();
});
test('publishing sheets preserves repositories, snapshot, history, schema and existing SVG export', async () => {
  const source = dungeon(), custom = { ...structuredClone(DEFAULT_PIECES[0]), id: 'custom-saved' };
  await pieceRepository.save(custom); await dungeonRepository.save(source);
  useDungeonStore.getState().setDungeon(source);
  const history = useDungeonStore.getState(), before = structuredClone(source), pieces = await db.pieceLibrary.toArray(), stored = await db.dungeons.toArray();
  const envelope = buildExportEnvelope(source), geometry = buildPublishMapGeometry(buildPublishDocument(source, 'player'));
  const svg = renderPublishSvg(geometry, defaultPublishProfile()).svg;
  const inv = buildDungeonInventory(source, 'player', true, () => geometry), p = profile(), o = options();
  renderPieceSheetDocument(inv.items, buildPieceSheetLayout(inv.items, p, o), p, o);
  assert.deepEqual(source, before); assert.deepEqual(await db.pieceLibrary.toArray(), pieces); assert.deepEqual(await db.dungeons.toArray(), stored);
  assert.equal(useDungeonStore.getState(), history); assert.deepEqual(buildExportEnvelope(source).dungeon, envelope.dungeon);
  assert.deepEqual(parseImport(envelope).dungeon.rooms, source.rooms);
  assert.equal(renderPublishSvg(geometry, defaultPublishProfile()).svg, svg);
});
