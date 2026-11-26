import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { unzipSync } from 'fflate';
import type { Connection, DungeonDocument, PlacedRoom } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import { buildPackagePlan, defaultPackageProfile, packageFilename, safePackagePath, validatePackagePlan, validatePackageProfile,
  MAX_PACKAGE_FILE_BYTES, MAX_PACKAGE_FILES, MAX_PACKAGE_TOTAL_BYTES, MEDIA_TYPES } from '../src/publishing/package/packagePlan';
import type { PackageArtifact, PackageArtifactRequest, PackageProfile } from '../src/publishing/package/packagePlan';
import { inventoryCsv, packageArtifact, packageManifest, packageReadme, utf8, validateManifest, validatePackageArtifacts } from '../src/publishing/package/packageFiles';
import { buildZip } from '../src/publishing/package/zipBuilder';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { defaultScenarioGuideOptions } from '../src/publishing/scenario/scenarioGuide';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { buildDungeonInventory, defaultPieceSheetSelection } from '../src/publishing/pieceSheet/inventory';
import { buildPieceSheetLayout } from '../src/publishing/pieceSheet/layout';
import { renderPieceSheetDocument } from '../src/publishing/pieceSheet/renderer';
import { buildPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { renderPublishSvg } from '../src/publishing/PublishMapRenderer';
import { parseImport } from '../src/utils/exportImport';
import { parsePieceImport } from '../src/editor/pieces/pieceJson';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { pieceRepository } from '../src/repository/pieceRepository';
import { db } from '../src/db/db';
import { useDungeonStore } from '../src/store/dungeonStore';

const dom = new JSDOM(''); Object.assign(globalThis, { window: dom.window });
const { createPackageBuilder } = await import('../src/publishing/package/buildPackage');
const { packagePublishProfile } = await import('../src/publishing/package/artifactGenerator');
const settings = () => ({ publish: defaultPublishProfile(), guides: { player: defaultScenarioGuideOptions('player'), gm: defaultScenarioGuideOptions('gm') }, print: defaultPrintProfile(), pieces: defaultPieceSheetSelection() });
const room = (id: string, x = 0, y = 0): PlacedRoom => ({ id, pieceId: DEFAULT_PIECES[0].id, piece: structuredClone(DEFAULT_PIECES[0]),
  position: { x, y }, rotation: 0, information: { ...emptyRoomInformation(id), name: 'PRIVATE_ROOM_NAME', gmNotes: 'PRIVATE_GM_NOTES', tags: ['PRIVATE_ROOM_TAG'] } });
const link = (id: string, from: string, to: string, type: Connection['type'] = 'corridor', a = 'east', b = 'west'): Connection => ({
  id, type, fromRoomId: from, toRoomId: to, fromConnectorId: `piece-rect-4x4-${a}`, toConnectorId: `piece-rect-4x4-${b}` });
const dungeon = (): DungeonDocument => ({ id: 'PRIVATE_PROJECT_ID', name: 'PRIVATE_PROJECT_NAME', version: '1.2.0', rooms: [room('01'), room('02', 12)],
  connections: [link('PRIVATE_NORMAL_CONNECTION_ID', '01', '02')], markdown: 'PRIVATE_SCENARIO_MARKDOWN', meta: { gridSize: 40 }, createdAt: '', updatedAt: '' });
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const pngBytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const fakePng = async () => new Blob([pngBytes], { type: 'image/png' });
const unpack = async (blob: Blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()));
const request = (kind: PackageArtifactRequest['kind'], path: string, audience: PackageArtifactRequest['audience'] = 'player'): PackageArtifactRequest => ({ kind, id: path, path, audience, required: true });
after(async () => { dom.window.close(); await db.delete(); });

for (const kind of ['player', 'gm', 'complete'] as const) test(`${kind} package defaults and deterministic plans`, () => {
  const p = defaultPackageProfile(kind), source = dungeon();
  const plan = buildPackagePlan(p, source); assert.deepEqual(plan, buildPackagePlan({ ...p, artifacts: [...p.artifacts].reverse() }, source));
  assert.equal(plan.artifacts.filter(r => r.kind === 'manifest').length, 1); assert.ok(plan.artifacts.some(r => r.kind === 'readme'));
  assert.ok(plan.artifacts.every(r => r.required));
  if (kind === 'player') assert.ok(plan.artifacts.every(r => r.audience === 'player' || r.audience === 'package'));
  if (kind === 'gm') { assert.ok(plan.artifacts.some(r => r.kind === 'scenario-print')); assert.ok(!plan.artifacts.some(r => r.audience === 'player')); }
  if (kind === 'complete') { assert.ok(plan.artifacts.some(r => r.kind === 'project-json')); assert.ok(plan.artifacts.some(r => r.audience === 'player')); }
});
test('invalid combinations, unknown kinds, duplicates and missing complete JSON are rejected', () => {
  for (const patch of [{ kind: 'bad' }, { artifacts: [] }, { artifacts: ['fake'] }, { artifacts: ['map-svg', 'map-svg'] },
    { includePlayerArtifacts: true }, { artifacts: ['project-json'] }, { artifacts: ['piece-library-json'] }, { title: '' }, { title: 'bad\nname' }, { title: 'x'.repeat(201) }]) {
    assert.throws(() => validatePackageProfile({ ...defaultPackageProfile(), ...patch } as never));
  }
  assert.throws(() => buildPackagePlan({ ...defaultPackageProfile('complete'), artifacts: ['map-svg'] }, dungeon()), /必須/);
});
test('only selected artifacts enter the plan; GM optionally includes player copies', () => {
  const p: PackageProfile = { ...defaultPackageProfile('gm'), artifacts: ['map-svg'], includeReadme: false };
  assert.deepEqual(buildPackagePlan(p, dungeon()).artifacts.map(r => r.path), ['gm/maps/map.svg', 'manifest.json']);
  assert.deepEqual(buildPackagePlan({ ...p, includePlayerArtifacts: true }, dungeon()).artifacts.map(r => r.path), ['gm/maps/map.svg', 'player/maps/map.svg', 'manifest.json']);
});
test('referenced custom pieces only, stable safe names, conflicting definitions rejected', () => {
  const source = dungeon(), p = { ...defaultPackageProfile('complete'), artifacts: ['project-json', 'piece-library-json'] as const };
  const custom = { ...source.rooms[0].piece, id: '../../PRIVATE_ID', name: '日本語/名称' };
  source.rooms[0] = { ...source.rooms[0], pieceId: custom.id, piece: custom };
  const plan = buildPackagePlan({ ...p, artifacts: [...p.artifacts] }, source);
  assert.deepEqual(plan.artifacts.filter(r => r.kind === 'piece-library-json').map(r => r.path), ['project/pieces/custom-piece-0001.json']);
  source.rooms.push({ ...source.rooms[0], id: '03', piece: { ...custom, cells: [{ x: 0, y: 0 }], connectors: [] } });
  assert.throws(() => buildPackagePlan({ ...p, artifacts: [...p.artifacts] }, source), /異なる定義/);
});
for (const path of ['/absolute.txt', '../escape', 'a/../b', 'a/./b', 'C:/drive', 'a\\b', 'a//b', 'a/evil\nname', 'a/trail.', 'CON.txt', 'a/NUL']) {
  test(`unsafe archive path rejected: ${JSON.stringify(path)}`, () => assert.throws(() => safePackagePath(path)));
}
test('Japanese safe paths and filenames retain text; normalized paths collide case-insensitively', () => {
  assert.equal(safePackagePath('素材/部屋.txt'), '素材/部屋.txt');
  const p = { ...defaultPackageProfile(), title: '古城:/地下*迷宮.. ' };
  assert.equal(packageFilename(p), '古城__地下_迷宮-player.zip');
  assert.equal(packageFilename({ ...p, title: 'CON' }), 'dungeon-CON-player.zip');
  const plan = buildPackagePlan(defaultPackageProfile(), dungeon()); plan.artifacts.push({ ...plan.artifacts[0], path: 'MAPS/MAP.SVG', id: 'MAPS/MAP.SVG' });
  assert.throws(() => validatePackagePlan(plan), /重複/);
});
test('plan validator rejects forged GM/project artifacts and audience/path/type mismatches', () => {
  for (const forged of [request('map-svg', 'gm/maps/map.svg', 'gm'), request('project-json', 'project/dungeon.json', 'project'),
    request('map-svg', 'maps/map.svg', 'package'), request('map-svg', 'maps/map.svg', 'project'), request('map-svg', 'maps/other.svg')]) {
    assert.throws(() => validatePackagePlan({ kind: 'player', artifacts: [forged, request('manifest', 'manifest.json', 'package')] }));
  }
});
test('CSV quotes Japanese, commas, quotes and newlines; neutralizes formulas and keeps quantities distinct', () => {
  const items = buildDungeonInventory(dungeon(), 'gm').items;
  items[0] = { ...items[0], name: '部屋,"名称"\n二行', requiredQuantity: 2, printQuantity: 4 };
  const csv = inventoryCsv(items, 'gm'); assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"部屋,""名称""\n二行"/); assert.match(csv, /"2","4"/);
  for (const value of ['=HYPERLINK("evil")', '+1', '-1', '@SUM(1)', '  =1', '\t=1', '\rname', '\nname', '\u0000=1']) {
    assert.ok(inventoryCsv([{ ...items[0], name: value }], 'gm').includes(`"'${value.replaceAll('"', '""')}"`));
  }
  assert.doesNotMatch(inventoryCsv([{ ...items[0], name: 'PRIVATE_NAME', pieceId: 'PRIVATE_PIECE_ID' }], 'player'), /PRIVATE_/);
});
test('artifact validator rejects missing, extra, forged, empty, malformed, oversized and duplicate files', () => {
  const profile = { ...defaultPackageProfile(), artifacts: ['map-svg'] as PackageProfile['artifacts'], includeReadme: false }, plan = buildPackagePlan(profile, dungeon());
  const files = [packageArtifact(plan.artifacts[0], '<svg/>'), packageArtifact(plan.artifacts[1], '{}')];
  assert.ok(validatePackageArtifacts(plan, files) > 0);
  for (const mutate of [
    (f: PackageArtifact[]) => { f.pop(); }, (f: PackageArtifact[]) => { f.push(f[0]); },
    (f: PackageArtifact[]) => { f[0].audience = 'gm'; }, (f: PackageArtifact[]) => { f[0].mediaType = 'text/html'; },
    (f: PackageArtifact[]) => { f[0].data = new Uint8Array(); f[0].sizeBytes = 0; },
    (f: PackageArtifact[]) => { f[0].sizeBytes++; }, (f: PackageArtifact[]) => { f[1].data = utf8('bad'); f[1].sizeBytes = 3; },
    (f: PackageArtifact[]) => { f[0].data = utf8('bad'); f[0].sizeBytes = 3; },
    (f: PackageArtifact[]) => { f[0].data = new Uint8Array(MAX_PACKAGE_FILE_BYTES + 1); f[0].sizeBytes = f[0].data.length; },
  ]) { const changed = structuredClone(files); mutate(changed); assert.throws(() => validatePackageArtifacts(plan, changed)); }
  const p = structuredClone(plan); p.artifacts = Array(MAX_PACKAGE_FILES + 1).fill(plan.artifacts[0]); assert.throws(() => validatePackagePlan(p));
});
test('uncompressed total limit is independent of ZIP size', () => {
  // Exercise the aggregate check using JSON files that are individually valid-sized.
  const requestList = Array.from({ length: 4 }, (_, i) => request('piece-library-json', `project/pieces/custom-piece-${String(i + 1).padStart(4, '0')}.json`, 'project'));
  requestList.forEach((r, i) => { r.pieceId = `piece-${i}`; });
  const large = new Uint8Array(MAX_PACKAGE_FILE_BYTES); large.fill(32); large[0] = 123; large[1] = 125;
  const p = { kind: 'gm' as const, artifacts: [...requestList, request('manifest', 'manifest.json', 'package')] };
  assert.throws(() => validatePackageArtifacts(p, requestList.map(r => packageArtifact(r, large)), false), /96MiB/);
  assert.ok(MAX_PACKAGE_TOTAL_BYTES < 4 * MAX_PACKAGE_FILE_BYTES);
});
test('README documents actual files only; manifest matches all non-manifest files and byte sizes', () => {
  const p = { ...defaultPackageProfile(), artifacts: ['map-svg'] as PackageProfile['artifacts'] }, plan = buildPackagePlan(p, dungeon());
  const files = [packageArtifact(plan.artifacts[0], '<svg/>')];
  const readme = packageReadme(p, files, []); assert.doesNotMatch(readme, /PNG|CSV|インポート|PDF/);
  files.push(packageArtifact(plan.artifacts.find(r => r.kind === 'readme')!, readme));
  files.push(packageArtifact(plan.artifacts.find(r => r.kind === 'manifest')!, packageManifest(p, files, '2026-11-26T00:00:00Z', [])));
  validateManifest(files);
  const manifest = JSON.parse(text(files.at(-1)!.data)); assert.equal(manifest.schemaVersion, '1.0.0'); assert.equal(manifest.packageType, 'player');
  assert.equal(manifest.files.length, 2); assert.ok(manifest.files.every((f: { path: string }) => f.path !== 'manifest.json'));
  assert.equal(manifest.files[1].sizeBytes, utf8(readme).length);
  files[0].sizeBytes++; assert.throws(() => validateManifest(files), /一致/);
});
test('ZIP round-trip preserves Japanese filenames, binary bytes and hierarchy without mutating buffers', async () => {
  const original = utf8('部屋の情報\n'.repeat(1000)), before = original.slice();
  const blob = await buildZip([{ path: '案内/部屋.txt', data: original, mediaType: 'text/plain' }, { path: 'images/tile.png', data: pngBytes, mediaType: 'image/png' }]);
  assert.equal(blob.type, 'application/zip'); const entries = await unpack(blob);
  assert.deepEqual(entries['案内/部屋.txt'], before); assert.deepEqual(entries['images/tile.png'], pngBytes); assert.deepEqual(original, before);
  assert.ok(blob.size < original.length);
});
test('ZIP rejects traversal, case collisions, empty and oversized content before compression', async () => {
  for (const files of [[], [{ path: '../a', data: utf8('a'), mediaType: 'text/plain' }],
    [{ path: 'a', data: utf8('a'), mediaType: 'text/plain' }, { path: 'A', data: utf8('a'), mediaType: 'text/plain' }],
    [{ path: 'a', data: new Uint8Array(), mediaType: 'text/plain' }]]) await assert.rejects(buildZip(files));
});
test('all player artifact types use existing renderers and whole unzipped package excludes secrets', async () => {
  const source = dungeon(); source.rooms.push(room('03', 0, 12)); source.connections.push(link('PRIVATE_SECRET_ID', '01', '03', 'secret', 'south', 'north'));
  source.rooms.forEach(r => { r.piece.name = 'PRIVATE_PIECE_NAME'; r.piece.tags = ['PRIVATE_PIECE_TAG']; });
  const p = { ...defaultPackageProfile(), artifacts: ['map-svg', 'map-png', 'scenario-guide', 'scenario-print', 'reference-map-print', 'battle-map-print', 'piece-sheets', 'piece-inventory'] as PackageProfile['artifacts'] };
  const config = settings(); config.publish = { ...defaultPublishProfile('gm'), showRoomNames: true };
  const observed: string[] = [];
  const builder = createPackageBuilder({ png: async svg => { observed.push(svg); return fakePng(); } });
  const result = await builder.build(source, p, config), entries = await unpack(result.blob);
  assert.equal(Object.keys(entries).length, 10); assert.equal(observed.length, 1);
  for (const [path, bytes] of Object.entries(entries)) { assert.doesNotMatch(path, /gm\/|project\//); assert.doesNotMatch(text(bytes), /PRIVATE_|gmNotes|piece-rect-4x4|information|fromRoomId/); }
  assert.doesNotMatch(observed[0], /PRIVATE_/);
  const expected = renderPublishSvg(buildPublishMapGeometry(buildPublishDocument(source, 'player')), packagePublishProfile(config.publish, 'player')).svg;
  assert.equal(text(entries['maps/map.svg']), expected);
  const inv = buildDungeonInventory(source, 'player'), layout = buildPieceSheetLayout(inv.items, config.print, config.pieces.options);
  assert.equal(text(entries['print/piece-sheets.html']), renderPieceSheetDocument(inv.items, layout, config.print, config.pieces.options));
  const manifest = JSON.parse(text(entries['manifest.json']));
  for (const f of manifest.files) assert.equal(f.sizeBytes, entries[f.path].length);
  assert.equal(result.uncompressedBytes, Object.values(entries).reduce((n, b) => n + b.length, 0));
});
test('complete ZIP restores existing project and Piece JSON without repository lookup', async () => {
  const source = dungeon(), custom = { ...structuredClone(DEFAULT_PIECES[0]), id: 'custom-piece', name: '参照素材', shape: 'custom' as const };
  source.rooms[0] = { ...source.rooms[0], piece: custom, pieceId: custom.id }; source.connections = [];
  const p = { ...defaultPackageProfile('complete'), artifacts: ['project-json', 'piece-library-json', 'scenario-guide', 'piece-inventory'] as PackageProfile['artifacts'] };
  const result = await createPackageBuilder().build(source, p, settings()), entries = await unpack(result.blob);
  const restored = parseImport(JSON.parse(text(entries['project/dungeon.json']))).dungeon;
  assert.deepEqual(restored.rooms, source.rooms); assert.equal(restored.markdown, source.markdown); assert.deepEqual(restored.connections, source.connections);
  assert.deepEqual(parsePieceImport(JSON.parse(text(entries['project/pieces/custom-piece-0001.json']))), parsePieceImport({ formatId: 'trpg-dungeon-piece', schemaVersion: '1.0.0', piece: custom }));
  assert.match(text(entries['gm/guide/scenario-guide.html']), /PRIVATE_GM_NOTES|PRIVATE_SCENARIO_MARKDOWN/);
  assert.doesNotMatch(text(entries['player/guide/scenario-guide.html']), /PRIVATE_/);
  assert.match(text(entries['README.txt']), /インポート|プレイヤーへ配布しない/);
});
test('capture is synchronous and immutable even if original document/settings change during generation', async () => {
  const source = dungeon(), config = settings(), p = { ...defaultPackageProfile('complete'), artifacts: ['project-json', 'map-png'] as PackageProfile['artifacts'] };
  let alter = true;
  const result = await createPackageBuilder({ png: fakePng }).build(source, p, config, { onProgress: progress => {
    if (alter && progress.phase === 'preparing') { alter = false; source.rooms = []; source.markdown = 'CHANGED'; config.publish.pixelsPerCell = 512; p.title = 'CHANGED'; p.artifacts = []; }
  } });
  const entries = await unpack(result.blob), restored = parseImport(JSON.parse(text(entries['project/dungeon.json']))).dungeon;
  assert.equal(restored.rooms.length, 2); assert.equal(restored.markdown, 'PRIVATE_SCENARIO_MARKDOWN'); assert.doesNotMatch(result.filename, /CHANGED/);
});
test('progress covers all phases; cancellation at a safe boundary never reaches ZIP and supports retry', async () => {
  const controller = new AbortController(), phases: string[] = []; let zipped = 0;
  const builder = createPackageBuilder({ zip: async (...args) => { zipped++; return buildZip(...args); } });
  const p = { ...defaultPackageProfile(), artifacts: ['map-svg'] as PackageProfile['artifacts'] };
  await assert.rejects(builder.build(dungeon(), p, settings(), { signal: controller.signal, onProgress: progress => {
    phases.push(progress.phase); if (progress.phase === 'generating' && progress.completedArtifacts === 1) controller.abort();
  } }), { name: 'AbortError' });
  assert.equal(zipped, 0); assert.equal(builder.busy, false);
  const progress: string[] = []; await builder.build(dungeon(), p, settings(), { onProgress: p => progress.push(p.phase) });
  assert.deepEqual([...new Set(progress)], ['preparing', 'generating', 'validating', 'compressing', 'completed']);
});
test('cancellation during asynchronous ZIP compression terminates without a result', async () => {
  const controller = new AbortController(), data = new Uint8Array(16 * 1024 * 1024); data.fill(80);
  const promise = buildZip([{ path: 'large.txt', data, mediaType: 'text/plain' }], controller.signal);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(promise, { name: 'AbortError' });
});
test('double execution is blocked; PNG/ZIP failures report their cause and permit retry', async () => {
  let release!: () => void, failing = true;
  const wait = new Promise<void>(r => { release = r; });
  const builder = createPackageBuilder({ png: async () => { await wait; if (failing) throw new Error('PNG_FAILED'); return fakePng(); } });
  const p = { ...defaultPackageProfile(), artifacts: ['map-png'] as PackageProfile['artifacts'] }, first = builder.build(dungeon(), p, settings());
  await assert.rejects(builder.build(dungeon(), p, settings()), /生成中/); release();
  await assert.rejects(first, /maps\/map.png.*PNG_FAILED/); assert.equal(builder.busy, false);
  failing = false; await builder.build(dungeon(), p, settings());
  const zipFailure = createPackageBuilder({ png: fakePng, zip: async () => { throw new Error('ZIP_FAILED'); } });
  await assert.rejects(zipFailure.build(dungeon(), p, settings()), /ZIP_FAILED/); assert.equal(zipFailure.busy, false);
});
test('cancellation remains a normal operation when an in-flight PNG conversion fails', async () => {
  const controller = new AbortController();
  const builder = createPackageBuilder({ png: async () => { controller.abort(); throw new Error('late raster error'); } });
  await assert.rejects(builder.build(dungeon(), { ...defaultPackageProfile(), artifacts: ['map-png'] }, settings(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(builder.busy, false);
});
test('unresolved player routes stop the job unless acknowledged, with no excluded secret IDs in warnings', async () => {
  const source = dungeon(); source.rooms.push(room('03', 4, 0));
  const p = { ...defaultPackageProfile(), artifacts: ['map-svg'] as PackageProfile['artifacts'] };
  await assert.rejects(createPackageBuilder().build(source, p, settings()), /未解決/);
  const result = await createPackageBuilder().build(source, p, settings(), { allowIncomplete: true });
  const entries = await unpack(result.blob); assert.ok(result.warnings.length);
  assert.doesNotMatch(text(entries['maps/map.svg']) + text(entries['manifest.json']), /PRIVATE_/);
});
test('aggregate print-page limit spans both audiences and all selected print documents', async () => {
  const source = dungeon(); source.rooms[1].position.y = 2;
  const config = settings(); config.print.map.cellSizeMm = 100; config.publish.paddingCells = 1;
  const p = { ...defaultPackageProfile('gm'), artifacts: ['reference-map-print', 'battle-map-print'] as PackageProfile['artifacts'], includePlayerArtifacts: true };
  await assert.rejects(createPackageBuilder().build(source, p, config), /合計は200ページ/);
});
test('incomplete routing/materials require explicit permission; invalid print/packing always fails', async () => {
  const source = dungeon(); source.rooms.push(room('03', 0, 12)); source.connections.push(link('PRIVATE_SECRET_ID', '01', '03', 'secret', 'south', 'north'));
  const p = { ...defaultPackageProfile('gm'), artifacts: ['piece-inventory'] as PackageProfile['artifacts'] };
  const builder = createPackageBuilder();
  await assert.rejects(builder.build(source, p, settings()), /特殊接続/);
  const allowed = await builder.build(source, p, settings(), { allowIncomplete: true }); assert.ok(allowed.warnings.length);
  const config = settings(); config.print.map.cellSizeMm = 100;
  const sheet = { ...defaultPackageProfile(), artifacts: ['piece-sheets'] as PackageProfile['artifacts'] };
  await assert.rejects(builder.build(dungeon(), sheet, config, { allowIncomplete: true }), /未配置/);
  config.print.marginsMm.left = 300;
  await assert.rejects(builder.build(dungeon(), { ...sheet, artifacts: ['battle-map-print'] }, config), /余白/);
});
test('selected library snapshot and manual quantities carry into CSV and piece sheets; player names remain generic', async () => {
  const config = settings(); config.pieces.options.source = 'library';
  config.pieces.library = [{ ...DEFAULT_PIECES[0], id: 'PRIVATE_LIBRARY_ID', name: 'PRIVATE_LIBRARY_NAME' }];
  config.pieces.quantities = { 'piece:PRIVATE_LIBRARY_ID': 3 };
  const p = { ...defaultPackageProfile(), artifacts: ['piece-sheets', 'piece-inventory'] as PackageProfile['artifacts'] };
  const entries = await unpack((await createPackageBuilder().build(dungeon(), p, config)).blob);
  assert.match(text(entries['print/piece-inventory.csv']), /"0","3"/);
  assert.equal(new JSDOM(text(entries['print/piece-sheets.html'])).window.document.querySelectorAll('use').length, 3);
  assert.doesNotMatch(text(entries['print/piece-sheets.html']) + text(entries['print/piece-inventory.csv']), /PRIVATE_/);
});
test('package generation preserves repositories, document, history and JSON schema', async () => {
  const source = dungeon(); await dungeonRepository.save(source); await pieceRepository.save({ ...DEFAULT_PIECES[0], id: 'unreferenced-private-piece' });
  useDungeonStore.getState().setDungeon(source);
  const state = useDungeonStore.getState(), before = structuredClone(source), stored = await db.dungeons.toArray(), pieces = await db.pieceLibrary.toArray();
  await createPackageBuilder({ png: fakePng }).build(source, defaultPackageProfile('complete'), settings());
  assert.deepEqual(source, before); assert.equal(useDungeonStore.getState(), state);
  assert.deepEqual(await db.dungeons.toArray(), stored); assert.deepEqual(await db.pieceLibrary.toArray(), pieces);
  assert.equal(Object.keys(MEDIA_TYPES).length, 12);
});
