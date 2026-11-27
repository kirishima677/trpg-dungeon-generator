import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import type { ContentRepository } from '../src/repository/contentRepository';
import { contentFixture, entityDungeon } from './fixtures/entityFixture';
import { CONTENT_KINDS } from '../src/model/content';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
class Channel {
  static instances = new Set<Channel>(); onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { Channel.instances.add(this); }
  postMessage(data: unknown) { for (const channel of Channel.instances) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data }); }
  close() { Channel.instances.delete(this); }
}
Object.assign(globalThis, { BroadcastChannel: Channel });
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RoomEntityPanel } = await import('../src/components/entities/RoomEntityPanel');
const { createContentRepository } = await import('../src/repository/contentRepository');
const { useDungeonStore } = await import('../src/store/dungeonStore');
const { db } = await import('../src/db/db');
const repository = createContentRepository(), state = () => useDungeonStore.getState(), doc = dom.window.document;
const button = (name: string) => { const b = [...doc.querySelectorAll('button')].find(b => b.textContent === name); assert.ok(b, name); return b; };
const click = (name: string) => act(async () => { button(name).click(); await new Promise(r => setTimeout(r, 5)); });
const field = (name: string) => { const element = doc.querySelector(`[aria-label="${name}"]`); assert.ok(element, name); return element as HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement; };
const input = (name: string, value: string) => act(() => {
  const el = field(name), prototype = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const select = (name: string, value: string) => act(() => { const el = field(name); el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
async function settle(test: () => boolean) { for (let n = 0; n < 100 && !test(); n++) await act(async () => { await new Promise(r => setTimeout(r, 2)); }); assert.ok(test()); }
beforeEach(async () => { state().setDungeon(entityDungeon()); state().selectRoom('room-0'); await db.contentDefinitions.clear(); await repository.saveMany(CONTENT_KINDS.map(contentFixture), 'skip'); });
after(async () => { await db.delete(); dom.window.close(); });
async function mount(repo: ContentRepository = repository) {
  const root = createRoot(doc.getElementById('root')!);
  await act(async () => root.render(createElement(RoomEntityPanel, { roomId: 'room-0', repository: repo })));
  await settle(() => !button('Entity追加').disabled || !!doc.querySelector('[role="alert"]'));
  return { async close() { await act(async () => root.unmount()); }, async showRoom(roomId: string) {
    await act(() => state().selectRoom(roomId));
    await act(async () => root.render(createElement(RoomEntityPanel, { key: roomId, roomId, repository: repo })));
  } };
}
async function choose(kind = 'monster', quantity = '1') {
  await click('Entity追加'); await select('Entity素材の種別', kind);
  const b = [...doc.querySelectorAll<HTMLButtonElement>('.entity-choices button')].find(b => b.textContent!.includes(contentFixture(kind as typeof CONTENT_KINDS[number]).name)); assert.ok(b);
  await act(() => b.click()); await input('追加するEntityの数量', quantity); await click('部屋へ追加');
}
test('actual picker searches and filters, adds all six kinds and keeps repeated definitions as separate instances', async () => {
  const ui = await mount();
  try {
    for (const kind of CONTENT_KINDS) await choose(kind, '4');
    await choose('monster', '2'); assert.equal(state().dungeon.entities.length, 7);
    assert.equal(new Set(state().dungeon.entities.map(e => e.id)).size, 7); assert.equal(doc.querySelectorAll('.entity-list-item').length, 7);
    assert.ok(state().dungeon.entities.every(e => e.visibility === 'gm-only'));
    await click('Entity追加'); await input('Entity素材検索', 'name_MONSTER'); assert.equal(doc.querySelectorAll('.entity-choices button').length, 1);
    await select('Entity素材の種別', 'treasure'); assert.equal(doc.querySelectorAll('.entity-choices button').length, 0); await click('閉じる');
    assert.equal(await db.contentDefinitions.count(), 6);
  } finally { await ui.close(); }
});
test('edits commit once, preserve invalid input, sanitize previews and keep pending fields during library notifications', async () => {
  const ui = await mount();
  try {
    await choose(); const count = state().undoStack.length;
    await input('Entity個別名称', '礼拝堂の守備隊'); await input('Entity数量', '0');
    await select('Entity公開範囲', 'public'); await input('配置の公開説明（Markdown）', '**公開説明**<script>alert(1)</script><img src=x onerror=alert(1)>');
    assert.equal(doc.querySelector('[aria-label="配置の公開説明のプレビュー"] script,img'), null);
    await click('GM専用情報'); await input('配置のGM専用情報（Markdown）', '配置の秘密');
    await act(async () => { await repository.save({ ...contentFixture(), name: '素材を更新' }, contentFixture().updatedAt); });
    assert.equal(field('Entity個別名称').value, '礼拝堂の守備隊'); assert.equal(field('Entity数量').value, '0');
    assert.equal(state().undoStack.length, count); await click('Entity情報を適用');
    assert.match(doc.body.textContent!, /数量は1/); assert.equal(field('Entity数量').value, '0'); assert.equal(state().undoStack.length, count);
    await input('Entity数量', '4'); await click('Entity情報を適用');
    const entity = state().dungeon.entities[0]; assert.equal(entity.quantity, 4); assert.equal(entity.gmNotes, '配置の秘密'); assert.equal(entity.visibility, 'public');
    assert.equal(state().undoStack.length, count + 1); assert.equal(entity.contentSnapshot.name, contentFixture().name);
    await input('Entity数量', '04'); await click('Entity情報を適用');
    assert.equal(field('Entity数量').value, '4'); assert.equal(state().undoStack.length, count + 1);
    assert.equal(button('Entityを複製').disabled, false);
  } finally { await ui.close(); }
});
test('duplicate, move, delete and undo preserve entity identity and do not write to the library', async () => {
  const ui = await mount();
  try {
    await choose(); const original = structuredClone(state().dungeon.entities[0]);
    await click('Entityを複製'); assert.equal(state().dungeon.entities.length, 2); assert.notEqual(state().dungeon.entities[1].id, original.id);
    await select('Entityの移動先', 'room-1'); await click('別の部屋へ移動');
    assert.equal(state().dungeon.entities.find(e => e.id === original.id)!.roomId, 'room-1');
    await ui.showRoom('room-1');
    await act(() => doc.querySelector<HTMLButtonElement>('.entity-list-item')!.click());
    await click('Entityを削除'); assert.ok(!state().dungeon.entities.some(e => e.id === original.id));
    await act(() => state().undo()); assert.deepEqual(state().dungeon.entities.find(e => e.id === original.id), { ...original, roomId: 'room-1' });
    assert.equal(await db.contentDefinitions.count(), 6);
  } finally { await ui.close(); }
});
test('snapshot update requires confirmation, preserves instance data and disables deleted/changed-kind sources', async () => {
  const ui = await mount();
  try {
    await choose(); await input('Entity個別名称', '個別名称'); await input('Entity数量', '8'); await click('Entity情報を適用');
    const original = structuredClone(state().dungeon.entities[0]);
    await act(async () => { await repository.save({ ...contentFixture(), attributes: { hp: 12 } }, contentFixture().updatedAt); });
    let updated = (await repository.get(contentFixture().id))!;
    await settle(() => !button('ライブラリの最新版を反映').disabled);
    await click('ライブラリの最新版を反映'); assert.ok(doc.querySelector('[aria-label="素材の更新確認"]'));
    assert.equal(state().dungeon.entities[0].contentSnapshot.attributes.hp, 7); await click('キャンセル');
    await click('ライブラリの最新版を反映'); await click('更新を確定');
    const refreshed = state().dungeon.entities[0]; assert.equal(refreshed.contentSnapshot.attributes.hp, 12);
    assert.deepEqual({ ...refreshed, contentSnapshot: original.contentSnapshot }, original);
    await act(async () => { updated = await repository.save({ ...updated, kind: 'npc' }, updated.updatedAt); });
    await settle(() => doc.body.textContent!.includes('種別が変更')); assert.equal(button('ライブラリの最新版を反映').disabled, true);
    await act(async () => { await repository.delete(updated.id, updated.updatedAt); });
    await settle(() => doc.body.textContent!.includes('素材は存在しません')); assert.equal(state().dungeon.entities[0].contentSnapshot.attributes.hp, 12);
  } finally { await ui.close(); }
});
test('material fetch failure keeps the add dialog and quantity, then retry succeeds', async () => {
  let fail = true;
  const ui = await mount({ ...repository, get: async id => { if (fail) throw new Error('素材取得失敗'); return repository.get(id); } });
  try {
    await choose('monster', '4'); assert.ok(doc.querySelector('[role="dialog"]')); assert.equal(field('追加するEntityの数量').value, '4');
    assert.match(doc.body.textContent!, /素材取得失敗/); assert.equal(state().dungeon.entities.length, 0);
    fail = false; await click('部屋へ追加'); assert.equal(state().dungeon.entities[0].quantity, 4);
  } finally { await ui.close(); }
});
test('late material fetch after closing the panel cannot add an entity to another dungeon', async () => {
  let resolve!: (value: ReturnType<typeof contentFixture>) => void;
  const pending = new Promise<ReturnType<typeof contentFixture>>(r => { resolve = r; });
  const ui = await mount({ ...repository, get: async () => pending });
  await choose(); assert.equal(state().dungeon.entities.length, 0); await ui.close();
  state().newDungeon(); await act(async () => resolve(contentFixture())); assert.equal(state().dungeon.entities.length, 0);
});
