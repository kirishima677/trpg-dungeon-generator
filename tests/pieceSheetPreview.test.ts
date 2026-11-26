import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { buildCorridorInventory, defaultPieceSheetOptions } from '../src/publishing/pieceSheet/inventory';
import type { preparePieceSheet as Prepare } from '../src/publishing/publicationSession';

const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true });
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { preparePieceSheet } = await import('../src/publishing/publicationSession');
const { usePieceSheetPreview } = await import('../src/components/publishing/usePieceSheetPreview');
type Sheet = ReturnType<typeof Prepare>;
type Output = ReturnType<typeof usePieceSheetPreview>;
after(() => dom.window.close());

function materials(quantity = 25) {
  return buildCorridorInventory().items.map(i => ({ ...i, printQuantity: quantity }));
}
function counted(sheet: Sheet) {
  const calls: (number | undefined)[] = [];
  return { sheet: { ...sheet, html: (page?: number) => { calls.push(page); return sheet.html(page); } }, calls };
}
function harness() {
  let output: Output;
  function Preview({ sheet, page }: { sheet: Sheet | null; page: number }) { output = usePieceSheetPreview(sheet, page); return null; }
  const root = createRoot(dom.window.document.getElementById('root')!);
  return { async show(sheet: Sheet | null, page = 0) { await act(async () => root.render(createElement(Preview, { sheet, page }))); return output!; },
    async close() { await act(async () => root.unmount()); } };
}

test('switching pages reuses full HTML and renders only the requested preview, including 1000 tiles', async () => {
  const items = materials(200), profile = defaultPrintProfile(), options = defaultPieceSheetOptions();
  const original = preparePieceSheet(items, profile, options), { sheet, calls } = counted(original), ui = harness();
  assert.ok(sheet.layout.pages.length > 10);
  try {
    const initial = await ui.show(sheet), full = initial.html;
    assert.ok(full); const complete = new JSDOM(full); assert.equal(complete.window.document.querySelectorAll('use').length, 1000); complete.window.close();
    for (let page = 1; page <= 10; page++) {
      const value = await ui.show(sheet, page);
      assert.equal(value.html, full); assert.equal(value.preview, original.html(page));
      const doc = new JSDOM(value.preview); assert.equal(doc.window.document.querySelectorAll('.print-sheet').length, 1); doc.window.close();
    }
    assert.equal(calls.filter(page => page === undefined).length, 1);
    assert.deepEqual(calls.filter(page => page !== undefined), Array.from({ length: 11 }, (_, n) => n));
    await ui.show(sheet, 10); assert.equal(calls.length, 12); // Ordinary re-render also reuses the selected preview.
  } finally { await ui.close(); }
});
test('quantity, paper, grid size and drawing changes replace the prepared document, never a stale export', async () => {
  const p = defaultPrintProfile(), o = defaultPieceSheetOptions(), ui = harness();
  const variants = [preparePieceSheet(materials(), p, o), preparePieceSheet(materials(26), p, o),
    preparePieceSheet(materials(26), { ...p, paperSize: 'A3' }, o),
    preparePieceSheet(materials(26), { ...p, map: { ...p.map, cellSizeMm: 20 } }, o),
    preparePieceSheet(materials(26), p, { ...o, showCutLines: false })];
  try {
    let previous = '';
    for (const value of variants) {
      const { sheet, calls } = counted(value), output = await ui.show(sheet);
      assert.equal(output.html, value.html()); assert.notEqual(output.html, previous);
      assert.deepEqual(calls, [undefined, 0]); previous = output.html;
    }
    assert.deepEqual(await ui.show(null), { html: '', preview: '', error: '' });
  } finally { await ui.close(); }
});
test('unplaced pieces still allow a partial preview and block complete HTML', async () => {
  const p = defaultPrintProfile(); p.paperSize = 'A5'; p.map.cellSizeMm = 100;
  const items = materials(1), large = { ...items[0], id: 'large', piece: { ...items[0].piece, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], connectors: [] } };
  const { sheet, calls } = counted(preparePieceSheet([items[0], large], p, defaultPieceSheetOptions())), ui = harness();
  try {
    assert.equal(sheet.layout.unplacedPieces.length, 1); assert.equal(sheet.layout.pages.length, 1);
    const output = await ui.show(sheet);
    assert.equal(output.html, ''); assert.match(output.preview, /未配置の素材があります/); assert.deepEqual(calls, [0]);
  } finally { await ui.close(); }
});
test('preview validation can block a cached full document after layout corruption', async () => {
  const value = preparePieceSheet(materials(), defaultPrintProfile(), defaultPieceSheetOptions()), { sheet, calls } = counted(value), ui = harness();
  try {
    assert.ok((await ui.show(sheet)).html);
    sheet.layout.pages[0].pieces[0].art.width *= 0.5;
    const invalid = await ui.show(sheet, 1);
    assert.equal(invalid.html, ''); assert.equal(invalid.preview, ''); assert.match(invalid.error, /寸法/);
    assert.equal(calls.filter(p => p === undefined).length, 1);
  } finally { await ui.close(); }
});
test('full-document generation failures remain blocking across navigation, and a corrected layout recovers', async () => {
  const value = preparePieceSheet(materials(), defaultPrintProfile(), defaultPieceSheetOptions()), ui = harness();
  const calls: (number | undefined)[] = [];
  const failed = { ...value, html: (page?: number) => { calls.push(page); throw new Error('FULL_DOCUMENT_LIMIT'); } };
  try {
    assert.match((await ui.show(failed)).error, /FULL_DOCUMENT_LIMIT/);
    assert.match((await ui.show(failed, 1)).error, /FULL_DOCUMENT_LIMIT/); assert.deepEqual(calls, [undefined]);
    const recovered = await ui.show(value); assert.ok(recovered.html); assert.equal(recovered.error, '');
  } finally { await ui.close(); }
});
