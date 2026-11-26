import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { defaultPrintProfile, changePrintTarget, PAPER_SIZES, printPaper, validatePrintProfile, MAX_PRINT_PAGES } from '../src/publishing/print/printProfile';
import type { PrintProfile } from '../src/publishing/print/printProfile';
import { buildPrintLayout, gridToMm, svgToMm, mmToSvg, printAreas, rowLabel } from '../src/publishing/print/printLayout';
import { checkPrintDocumentSize, cutMarkSegments, renderMapPrintDocument, renderScenarioPrintDocument, sharedMapDefinition } from '../src/publishing/print/printDocument';
import { createBrowserPrintAdapter, PRINT_SESSION_TIMEOUT_MS } from '../src/publishing/print/browserPrint';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { buildPublishDocument, buildScenarioPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { renderPublishSvg } from '../src/publishing/PublishMapRenderer';
import { buildScenarioGuide, renderScenarioMap } from '../src/publishing/scenario/scenarioGuideBuilder';
import { defaultScenarioGuideOptions } from '../src/publishing/scenario/scenarioGuide';
import { useDungeonStore } from '../src/store/dungeonStore';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { db } from '../src/db/db';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';

const dom = new JSDOM(''); Object.assign(globalThis, { window: dom.window });
const { renderScenarioHtml } = await import('../src/publishing/scenario/scenarioHtmlRenderer');
const near = (a: number, b: number, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≠ ${b}`);
const profile = (target: PrintProfile['target'] = 'battle-map') => defaultPrintProfile(target);
const bounds = (width = 14, height = 20, x = -2, y = -3) => ({ minX: x, minY: y, maxX: x + width, maxY: y + height });
const noDecorations = (): PrintProfile => { const p = profile(); p.showPageLabels = false; p.map.showCutMarks = false; p.map.showScaleBar = false; return p; };
after(async () => { dom.window.close(); await db.delete(); });

test('print defaults separate audience, physical units, paper margins and image resolution', () => {
  const p = profile(); assert.equal(p.paperSize, 'A4'); assert.equal(p.orientation, 'portrait');
  assert.deepEqual(p.marginsMm, { top: 10, right: 10, bottom: 10, left: 10 }); assert.equal(p.map.cellSizeMm, 25.4);
  assert.equal(p.map.tileOverlapMm, 0); assert.equal(p.map.scaleMode, 'physical-grid'); assert.ok(!('audience' in p)); assert.ok(!('pixelsPerCell' in p.map));
  assert.equal(changePrintTarget(p, 'reference-map').map.scaleMode, 'fit-page'); assert.equal(p.target, 'battle-map');
});
for (const [name, size] of Object.entries(PAPER_SIZES)) {
  for (const orientation of ['portrait', 'landscape'] as const) test(`${name} ${orientation}: paper and asymmetric printable margins`, () => {
    const p = { ...profile(), paperSize: name, orientation, marginsMm: { top: 7, right: 11, bottom: 13, left: 17 } } as PrintProfile;
    const paper = printPaper(p), area = printAreas(p);
    assert.equal(paper.width, orientation === 'portrait' ? size.width : size.height);
    assert.equal(paper.height, orientation === 'portrait' ? size.height : size.width);
    near(area.printableWidthMm, paper.width - 28); near(area.printableHeightMm, paper.height - 20);
  });
}
test('invalid paper, orientation, flags, margins, physical grid and overlap are rejected', () => {
  for (const patch of [{ paperSize: 'B4' }, { orientation: 'sideways' }, { target: 'pdf' }, { showPageLabels: 1 },
    { marginsMm: { top: -1, right: 0, bottom: 0, left: 0 } }, { marginsMm: { top: 297, right: 0, bottom: 0, left: 0 } },
    { marginsMm: { top: 0, right: 210, bottom: 0, left: 0 } }, { marginsMm: { top: NaN, right: 0, bottom: 0, left: 0 } }]) {
    assert.throws(() => validatePrintProfile({ ...profile(), ...patch } as never));
  }
  for (const patch of [{ cellSizeMm: 0 }, { cellSizeMm: 101 }, { cellSizeMm: Infinity }, { tileOverlapMm: -1 }, { tileOverlapMm: 101 }, { tileOverlapMm: NaN }, { scaleMode: 'fit-page' }]) {
    const p = profile(); assert.throws(() => validatePrintProfile({ ...p, map: { ...p.map, ...patch } } as never));
  }
});
test('units preserve fractional/negative positions and distinguish 25mm from one inch', () => {
  near(gridToMm(4, 25.4), 101.6); near(gridToMm(4, 25), 100);
  near(svgToMm(-60, 25.4), -38.1); near(mmToSvg(38.1, 25.4), 60);
  near(svgToMm(mmToSvg(12.3456, 25.4), 25.4), 12.3456);
});
for (const [width, height] of [[2, 40], [40, 2], [20, 20]]) test(`reference ${width}×${height} fits and centers without aspect distortion`, () => {
  const p = profile('reference-map'), layout = buildPrintLayout(bounds(width, height), p), b = layout.pages[0].contentBoundsMm, area = layout.contentAreaMm;
  assert.equal(layout.pages.length, 1); assert.ok(b.width <= area.width + 1e-8); assert.ok(b.height <= area.height + 1e-8);
  near(b.width / b.height, width / height); near(b.x - area.x, (area.width - b.width) / 2); near(b.y - area.y, (area.height - b.height) / 2);
});
test('battle maps keep 25.4mm across one-page, horizontal, vertical and two-axis tiling', () => {
  for (const [width, height, columns, rows] of [[4, 4, 1, 1], [14, 4, 2, 1], [4, 20, 1, 2], [14, 20, 2, 2]]) {
    const layout = buildPrintLayout(bounds(width, height), noDecorations());
    assert.equal(layout.columns, columns); assert.equal(layout.rows, rows);
    for (const page of layout.pages) {
      near(page.contentBoundsMm.width / (page.sourceBounds.width / 40), 25.4);
      near(page.contentBoundsMm.height / (page.sourceBounds.height / 40), 25.4);
      near(page.sourceBounds.x / 40, Math.round(page.sourceBounds.x / 40));
      near(page.sourceBounds.y / 40, Math.round(page.sourceBounds.y / 40));
    }
    near(layout.mapWidthMm, width * 25.4); near(layout.mapHeightMm, height * 25.4);
  }
});
test('joining edges follow whole cells while exact 5/10mm overlaps preserve identical coordinates', () => {
  for (const overlap of [0, 5, 10]) {
    const p = noDecorations(); p.map.tileOverlapMm = overlap;
    const layout = buildPrintLayout(bounds(30, 30, -11, -7), p), a = layout.pages[0], b = layout.pages[1], below = layout.pages[layout.columns];
    near(svgToMm(a.sourceBounds.x + a.sourceBounds.width - b.sourceBounds.x, 25.4), overlap);
    near(svgToMm(a.sourceBounds.y + a.sourceBounds.height - below.sourceBounds.y, 25.4), overlap);
    near((a.cutBounds.x + a.cutBounds.width) / 40, b.sourceBounds.x / 40);
    near((a.cutBounds.y + a.cutBounds.height) / 40, below.sourceBounds.y / 40);
    const last = layout.pages.at(-1)!;
    assert.ok(last.sourceBounds.x + last.sourceBounds.width >= layout.sourceBounds.x + layout.sourceBounds.width - 1e-8);
    assert.ok(last.sourceBounds.y + last.sourceBounds.height >= layout.sourceBounds.y + layout.sourceBounds.height - 1e-8);
  }
});
test('decorations reserve space before page calculation and cut marks remain outside artwork', () => {
  const p = profile(), layout = buildPrintLayout(bounds(30, 30), p), area = layout.contentAreaMm;
  assert.equal(area.x, 3); assert.equal(area.y, 13); near(area.width, 184); near(area.height, 253);
  p.map.tileOverlapMm = 5;
  for (const page of buildPrintLayout(bounds(30, 30), p).pages) {
    const current = buildPrintLayout(bounds(30, 30), p), b = page.contentBoundsMm;
    for (const l of cutMarkSegments(page, current)) {
      assert.ok(Math.min(l.x1, l.x2) >= -1e-8 && Math.max(l.x1, l.x2) <= current.printableWidthMm + 1e-8);
      assert.ok(Math.min(l.y1, l.y2) >= -1e-8 && Math.max(l.y1, l.y2) <= current.printableHeightMm + 1e-8);
      assert.ok(Math.max(l.x1, l.x2) < b.x || Math.min(l.x1, l.x2) > b.x + b.width || Math.max(l.y1, l.y2) < b.y || Math.min(l.y1, l.y2) > b.y + b.height);
    }
  }
});
test('wall/label padding is covered by outward rounding to grid boundaries without changing source data', () => {
  const b = { minX: -3.2, minY: -1.2, maxX: 4.2, maxY: 7.2 }, before = { ...b };
  const layout = buildPrintLayout(b, profile()); assert.deepEqual(b, before);
  assert.deepEqual(layout.sourceBounds, { x: -160, y: -80, width: 360, height: 400 });
});
test('floating-point noise does not add pages or lose boundary coverage', () => {
  const p = noDecorations(); p.marginsMm.right = 22.2; // 177.8mm = exactly seven 25.4mm cells.
  const a = buildPrintLayout(bounds(14, 20), p), b = buildPrintLayout(bounds(14 + 1e-10, 20 - 1e-10), p);
  assert.equal(a.columns, 2); assert.equal(b.columns, 2); assert.equal(a.rows, b.rows);
});
test('disabled tiling, impossible cell alignment, overlap and excessive pages fail before allocating pages', () => {
  const p = noDecorations(); p.map.allowTiling = false; assert.throws(() => buildPrintLayout(bounds(30, 30), p), /分割印刷/);
  const tiny = noDecorations(); tiny.marginsMm.left = 100; tiny.marginsMm.right = 100;
  assert.throws(() => buildPrintLayout(bounds(30, 30), tiny), /1セル/);
  const overlap = profile(); overlap.map.tileOverlapMm = 100; overlap.marginsMm.left = 80;
  assert.throws(() => buildPrintLayout(bounds(30, 30), overlap), /重複領域/);
  assert.throws(() => buildPrintLayout(bounds(10000, 10000), profile()), new RegExp(`${MAX_PRINT_PAGES}ページ`));
  assert.throws(() => buildPrintLayout({ ...bounds(), minX: Infinity }, profile()), /描画範囲/);
  assert.throws(() => buildPrintLayout(bounds(), profile('scenario-guide')), /ブラウザ/);
});
test('a single-cell map fits even when overlap is irrelevant on that axis', () => {
  const p = noDecorations(); p.map.cellSizeMm = 100; p.map.tileOverlapMm = 5; p.marginsMm.right = 100;
  const layout = buildPrintLayout(bounds(1, 1), p); assert.equal(layout.pages.length, 1); near(layout.mapWidthMm, 100);
});
test('page labels continue after Z without using source room IDs or labels', () => { assert.equal(rowLabel(0), 'A'); assert.equal(rowLabel(25), 'Z'); assert.equal(rowLabel(26), 'AA'); });
test('print HTML uses physical units, one vector definition, unique IDs, exact margins and last-page CSS', () => {
  const p = profile(), layout = buildPrintLayout(bounds(15, 20), p);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><clipPath id="crop"><rect width="40" height="40"/></clipPath></defs><path clip-path="url(#crop)" d="M 0 0 H 40"/></svg>';
  const html = renderMapPrintDocument(svg, layout, p, '日本語 <script> & 地下迷宮', 'player'), doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('.print-sheet').length, layout.pages.length);
  assert.equal(doc.querySelectorAll('#print-map-art').length, 1); assert.equal(doc.querySelectorAll('#print-source-crop').length, 1);
  assert.equal(doc.querySelectorAll('use[href="#print-map-art"]').length, layout.pages.length);
  const ids = [...doc.querySelectorAll('[id]')].map(e => e.id); assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /size: 210mm 297mm/); assert.match(html, /margin: 10mm 10mm 10mm 10mm/);
  assert.match(html, /\.print-sheet:last-child \{ break-after: auto/); assert.match(html, /zoom: 1/);
  assert.match(doc.querySelector('.print-map')!.getAttribute('width')!, /mm$/); assert.equal(doc.querySelector('script'), null);
  assert.match(html, /25\.4 mm/); assert.match(html, /100%/);
  const preview = new JSDOM(renderMapPrintDocument(svg, layout, p, 'Map', 'player', 1)).window.document;
  assert.equal(preview.querySelectorAll('.print-sheet').length, 1); assert.equal(preview.querySelector('.print-sheet')!.getAttribute('aria-label'), 'Page A-2');
  assert.throws(() => sharedMapDefinition('<bad>')); assert.throws(() => checkPrintDocumentSize('x'.repeat(16 * 1024 * 1024 + 1)));
});
test('scenario print reuses sanitized HTML, permits long-room breaks, and adds paper CSS without double margins', () => {
  const source = '<!DOCTYPE html><html lang="ja"><head><style>body{color:black}</style></head><body><p>日本語</p></body></html>';
  const p = profile('scenario-guide'); p.paperSize = 'Letter'; p.orientation = 'landscape';
  const html = renderScenarioPrintDocument(source, p);
  assert.match(html, /size: 279\.4mm 215\.9mm/); assert.match(html, /body \{ width: auto; margin: 0; padding: 0/);
  assert.match(html, /room-guide--short \{ break-inside: avoid/); assert.match(html, /room-guide:not\(\.room-guide--short\).*break-inside: auto/);
  assert.match(html, /日本語/); assert.throws(() => renderScenarioPrintDocument(source, profile()));
});
test('short rooms stay together while long Markdown remains complete and may span pages', () => {
  const source = fixture(); source.rooms[1].information.description = '長い公開説明。\n\n'.repeat(1000);
  const pub = defaultPublishProfile(), opts = { ...defaultScenarioGuideOptions('player'), includeMap: false };
  const guide = buildScenarioGuide(buildScenarioPublishDocument(source, pub, opts), opts);
  const html = renderScenarioPrintDocument(renderScenarioHtml(guide), profile('scenario-guide'));
  const doc = new JSDOM(html).window.document, articles = doc.querySelectorAll('article');
  assert.ok(articles[0].classList.contains('room-guide--short')); assert.ok(!articles[1].classList.contains('room-guide--short'));
  assert.equal((articles[1].textContent!.match(/長い公開説明。/g) ?? []).length, 1000);
});

function fixture() {
  const room = (id: string, x: number, number: string) => ({ id, pieceId: DEFAULT_PIECES[0].id, piece: structuredClone(DEFAULT_PIECES[0]), position: { x, y: 0 }, rotation: 0 as const,
    information: { ...emptyRoomInformation(number), name: 'PRIVATE_NAME', description: '公開の説明', gmNotes: 'PRIVATE_GM_NOTE', tags: ['PRIVATE_TAG'] } });
  return { id: 'dungeon', name: '古城', version: '1.2.0', rooms: [room('first', -8, '01'), room('last', 12, '02')], connections: [
    { id: 'PRIVATE_SECRET_ID', fromRoomId: 'first', toRoomId: 'last', fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west', type: 'secret' as const }],
    markdown: 'PRIVATE_GLOBAL_MARKDOWN', meta: { gridSize: 40 }, createdAt: '', updatedAt: '' };
}
test('player physical pages and scenario document exclude private sentinels before layout/rendering', () => {
  const source = fixture(), pub = defaultPublishProfile(), geometry = buildPublishMapGeometry(buildPublishDocument(source, 'player'));
  const map = renderPublishSvg(geometry, pub), p = profile(), layout = buildPrintLayout(map.bounds, p);
  const html = renderMapPrintDocument(map.svg, layout, p, source.name, 'player');
  assert.doesNotMatch(html, /PRIVATE_|#7c3aed|#dc2626|stroke-dasharray|data-/);
  const opts = defaultScenarioGuideOptions('player'), doc = buildScenarioPublishDocument(source, pub, opts);
  const guideMap = renderScenarioMap(geometry, doc, pub), guide = buildScenarioGuide(doc, opts, { audience: 'player', svg: guideMap.svg });
  assert.doesNotMatch(renderScenarioPrintDocument(renderScenarioHtml(guide), profile('scenario-guide')), /PRIVATE_|#7c3aed|#dc2626/);
});
test('printing layouts preserve source, repository, history, JSON and geometry across page changes', async () => {
  const state = useDungeonStore.getState(); state.newDungeon();
  for (const room of fixture().rooms) state.addRoom(room);
  const current = useDungeonStore.getState(), source = current.dungeon;
  await dungeonRepository.save(source);
  const saved = await db.dungeons.toArray(), pieces = await db.pieceLibrary.toArray(), before = structuredClone(source), undo = structuredClone(current.undoStack), redo = structuredClone(current.redoStack);
  const geometry = buildPublishMapGeometry(buildPublishDocument(source, 'gm')), scene = geometry.scene;
  const svg = renderPublishSvg(geometry, defaultPublishProfile('gm'));
  for (const size of Object.keys(PAPER_SIZES) as PrintProfile['paperSize'][]) buildPrintLayout(svg.bounds, { ...profile(), paperSize: size });
  assert.equal(geometry.scene, scene); assert.deepEqual(source, before);
  assert.deepEqual(await db.dungeons.toArray(), saved); assert.deepEqual(await db.pieceLibrary.toArray(), pieces);
  assert.deepEqual(useDungeonStore.getState().undoStack, undo); assert.deepEqual(useDungeonStore.getState().redoStack, redo);
  assert.deepEqual(parseImport(JSON.parse(JSON.stringify(buildExportEnvelope(source)))).dungeon, source);
});
function fakePrintWindow(fail = false, automatic = true) {
  const events = new EventTarget(); let written = '', prints = 0, closed = false;
  const popup = { get closed() { return closed; }, opener: {} as unknown, close: () => { closed = true; }, focus: () => {},
    print: () => { prints++; if (fail) throw new Error('print failed'); if (automatic) queueMicrotask(() => events.dispatchEvent(new Event('afterprint'))); },
    document: { readyState: 'complete', fonts: { ready: Promise.resolve() }, open: () => {}, write: (html: string) => { written = html; }, close: () => {} },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  return { popup, events, read: () => ({ written, prints, closed }) };
}
test('browser print adapter opens exact HTML and treats printing/cancellation as normal completion', async () => {
  const fake = fakePrintWindow(), adapter = createBrowserPrintAdapter(() => fake.popup as never);
  const pending = adapter.print('<!DOCTYPE html><html><body>日本語</body></html>'); assert.equal(adapter.busy, true);
  await assert.rejects(adapter.print('duplicate'), /印刷画面/); await pending;
  assert.equal(adapter.busy, false); assert.equal(fake.read().closed, true); assert.equal(fake.read().prints, 1); assert.match(fake.read().written, /日本語/); assert.equal(fake.popup.opener, null);
});
test('browser print adapter handles popup failure, print errors and owner cleanup', async () => {
  await assert.rejects(createBrowserPrintAdapter(() => null).print('html'), /ポップアップ/);
  const failed = fakePrintWindow(true), failingAdapter = createBrowserPrintAdapter(() => failed.popup as never);
  await assert.rejects(failingAdapter.print('html'), /print failed/); assert.equal(failed.read().closed, true); assert.equal(failingAdapter.busy, false);
  const fake = fakePrintWindow(false, false), adapter = createBrowserPrintAdapter(() => fake.popup as never), pending = adapter.print('html');
  // Wait for the adapter's document/font microtasks, without browser timing assumptions.
  for (let i = 0; i < 6; i++) await Promise.resolve();
  adapter.close(); await pending; assert.equal(adapter.busy, false); assert.equal(fake.read().closed, true);
});
test('a missing afterprint event releases the UI but preserves the print window until explicit cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fake = fakePrintWindow(false, false), adapter = createBrowserPrintAdapter(() => fake.popup as never), pending = adapter.print('html');
  for (let i = 0; i < 12 && !fake.read().prints; i++) await Promise.resolve();
  assert.equal(fake.read().prints, 1);
  t.mock.timers.tick(PRINT_SESSION_TIMEOUT_MS); await pending;
  assert.equal(adapter.busy, false); assert.equal(adapter.hasWindows, true); assert.equal(fake.read().closed, false);
  adapter.close(); assert.equal(adapter.hasWindows, false); assert.equal(fake.read().closed, true);
});
