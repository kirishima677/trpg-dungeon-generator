import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DungeonDocument } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import type { PublicationRuntime } from '../src/components/publishing/usePublicationActions';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/?publishing=1&source=ui-test&dungeonId=ui-dungeon' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true });
class Channel {
  static latest: Channel;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor() { Channel.latest = this; }
  postMessage() {}
  close() {}
}
Object.assign(globalThis, { BroadcastChannel: Channel });
const downloads: string[] = [];
dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PublishingWorkspace } = await import('../src/components/publishing/PublishingWorkspace');
const { db } = await import('../src/db/db');
const source = (): DungeonDocument => ({ id: 'ui-dungeon', name: '画面検証', version: '1.2.0', markdown: '', meta: { gridSize: 40 }, createdAt: '', updatedAt: '',
  rooms: [0, 12].map((x, n) => ({ id: `room-${n}`, pieceId: DEFAULT_PIECES[0].id, piece: structuredClone(DEFAULT_PIECES[0]), position: { x, y: 0 }, rotation: 0,
    information: { ...emptyRoomInformation(String(n + 1)), name: 'PRIVATE_NAME', gmNotes: 'PRIVATE_NOTES' } })),
  connections: [{ id: 'link', type: 'corridor', fromRoomId: 'room-0', toRoomId: 'room-1', fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west' }] });
const doc = dom.window.document;
const button = (name: string) => { const el = [...doc.querySelectorAll('button')].find(b => b.textContent === name); assert.ok(el, `button: ${name}`); return el; };
const field = (name: string) => { const label = [...doc.querySelectorAll('label')].find(l => l.firstChild?.textContent?.trim() === name || l.textContent?.trim() === name);
  const el = label?.querySelector('input,select'); assert.ok(el, `field: ${name}`); return el as HTMLInputElement & HTMLSelectElement; };
const click = (name: string) => act(() => { button(name).click(); });
const check = (name: string) => act(() => { field(name).click(); });
const select = (name: string, value: string) => act(() => { const el = field(name); el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
const number = (name: string, value: string) => act(() => {
  const el = field(name); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
async function deliver(value: DungeonDocument) { await act(async () => { Channel.latest.onmessage!({ data: { type: 'snapshot', token: 'ui-test', dungeonId: value.id, document: structuredClone(value) } }); }); }
async function mount(runtime?: PublicationRuntime) {
  const root = createRoot(doc.getElementById('root')!);
  await act(async () => root.render(createElement(PublishingWorkspace, { runtime })));
  await deliver(source()); return () => act(() => root.unmount());
}
async function finish() {
  for (let i = 0; i < 100 && button('ZIP生成・ダウンロード').disabled; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  assert.equal(button('ZIP生成・ダウンロード').disabled, false);
}
after(async () => { dom.window.close(); await db.delete(); });

test('publication UI preserves piece quantities, paper and package choices across tabs', async () => {
  const unmount = await mount();
  try {
    await click('ピース印刷'); await number('R-001の印刷数', '3'); assert.equal(field('R-001の印刷数').value, '3');
    await select('用紙', 'A3'); await click('一括出版'); await select('パッケージ種別', 'complete');
    await click('ピース印刷'); assert.equal(field('R-001の印刷数').value, '3'); assert.equal(field('用紙').value, 'A3');
    await click('一括出版'); assert.equal(field('パッケージ種別').value, 'complete');
    assert.equal(field('プロジェクトJSON（必須）').disabled, true);
  } finally { await unmount(); }
});
test('publication UI separates GM/player guide options and hides private fields in player HTML', async () => {
  const unmount = await mount();
  try {
    await click('シナリオガイド'); await select('対象', 'gm'); await check('GM専用情報を含める');
    assert.equal(field('GM専用情報を含める').checked, false);
    await select('対象', 'player');
    const html = doc.querySelector('iframe')!.getAttribute('srcdoc')!; assert.doesNotMatch(html, /PRIVATE_/);
    await select('対象', 'gm'); assert.equal(field('GM専用情報を含める').checked, false);
  } finally { await unmount(); }
});
test('explicit snapshot refresh resets dungeon quantities while retaining physical print settings', async () => {
  const unmount = await mount();
  try {
    await click('ピース印刷'); await number('R-001の印刷数', '5'); await select('用紙', 'A5');
    const next = source(); next.connections = []; next.rooms.pop(); await deliver(next);
    assert.equal(field('R-001の印刷数').value, '1'); assert.equal(field('用紙').value, 'A5');
  } finally { await unmount(); }
});
test('invalid piece quantities keep their input visible and can be corrected without leaving the tab', async () => {
  const unmount = await mount();
  try {
    await click('ピース印刷'); await number('R-001の印刷数', '');
    assert.equal(field('R-001の印刷数').value, ''); assert.equal(button('印刷用HTMLを保存').disabled, true);
    assert.match(doc.body.textContent!, /印刷数は0〜500の整数/);
    await number('R-001の印刷数', '3'); assert.equal(button('印刷用HTMLを保存').disabled, false);
    assert.equal(field('R-001の印刷数').value, '3');
  } finally { await unmount(); }
});
test('package UI cancels before download, unlocks tabs and can run again', async () => {
  const unmount = await mount(), before = downloads.length;
  try {
    await click('一括出版'); await check('PNGマップ'); await check('HTMLシナリオガイド');
    await click('ZIP生成・ダウンロード'); assert.equal(button('マップ出力').disabled, true);
    await click('キャンセル'); await finish();
    assert.equal(downloads.length, before); assert.match(doc.body.textContent!, /生成をキャンセルしました/);
    assert.equal(button('マップ出力').disabled, false);
    await click('ZIP生成・ダウンロード'); await finish(); assert.equal(downloads.length, before + 1);
    assert.match(doc.body.textContent!, /出版パッケージ生成完了/);
  } finally { await unmount(); }
});
for (const failure of [false, true]) test(`a refreshed snapshot discards stale PNG ${failure ? 'errors' : 'results'} and restores controls`, async () => {
  let resolve!: (blob: Blob) => void, reject!: (error: Error) => void, downloaded = 0;
  const pending = new Promise<Blob>((a, b) => { resolve = a; reject = b; });
  const unmount = await mount({ png: async () => pending, download: () => { downloaded++; } });
  try {
    const pngButton = button('PNG出力'); await click('PNG出力'); assert.equal(pngButton.disabled, true);
    const next = source(); next.name = '更新後のマップ'; next.connections = []; next.rooms.pop(); await deliver(next);
    await act(async () => { if (failure) reject(new Error('STALE_PNG_ERROR')); else resolve(new Blob(['PNG'])); await pending.catch(() => {}); });
    assert.equal(downloaded, 0); assert.equal(button('PNG出力').disabled, false);
    assert.match(doc.body.textContent!, /更新後のマップ/); assert.doesNotMatch(doc.body.textContent!, /STALE_PNG_ERROR/);
  } finally { await unmount(); }
});
test('individual export errors release the busy state and allow retry', async () => {
  let fail = true, downloaded = 0;
  const unmount = await mount({ png: async () => { if (fail) throw new Error('PNG_RETRY_ERROR'); return new Blob(['PNG']); }, download: () => { downloaded++; } });
  try {
    await act(async () => { button('PNG出力').click(); });
    assert.match(doc.body.textContent!, /PNG_RETRY_ERROR/); assert.equal(button('PNG出力').disabled, false);
    fail = false; await act(async () => { button('PNG出力').click(); });
    assert.equal(downloaded, 1); assert.doesNotMatch(doc.body.textContent!, /PNG_RETRY_ERROR/);
  } finally { await unmount(); }
});
test('print action uses the displayed player HTML, prevents duplicate execution and closes on unmount', async () => {
  let complete!: () => void, calls = 0, closes = 0, html = '';
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const unmount = await mount({ createPrinter: () => ({ busy: false, hasWindows: false,
    print: async value => { html = value; calls++; await pending; }, close: () => { closes++; } }) });
  try {
    await click('印刷 / PDF'); const printButton = button('印刷 / PDF保存'); await click('印刷 / PDF保存');
    assert.equal(printButton.disabled, true); printButton.click(); assert.equal(calls, 1);
    assert.doesNotMatch(html, /PRIVATE_/); assert.match(html, /<!DOCTYPE html>/);
    await act(async () => { complete(); await pending; }); assert.equal(button('印刷 / PDF保存').disabled, false);
  } finally { await unmount(); }
  assert.equal(closes, 1);
});
