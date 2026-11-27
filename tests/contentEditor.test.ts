import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { publicationFixture, fixtureTimestamp } from './fixtures/publicationFixture';
import { publicationBaselineData } from './fixtures/publicationBaselineData';
import type { ContentRepository } from '../src/repository/contentRepository';
import type { ContentDefinition } from '../src/model/content';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/?contentEditor=1' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
class Channel {
  static instances = new Set<Channel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { Channel.instances.add(this); }
  postMessage(data: unknown) { for (const channel of Channel.instances) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data }); }
  close() { Channel.instances.delete(this); }
}
Object.assign(globalThis, { BroadcastChannel: Channel });
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { db } = await import('../src/db/db');
const { createContentRepository } = await import('../src/repository/contentRepository');
const { useContentEditor } = await import('../src/components/content/useContentEditor');
const { ContentEditor } = await import('../src/components/content/ContentEditor');
const { CONTENT_KINDS, newContent } = await import('../src/model/content');
const { buildContentExport } = await import('../src/content/contentJson');
const repository = createContentRepository();
const fixture = (id = 'monster'): ContentDefinition => ({ ...newContent(), id, name: '洞窟の小鬼', summary: '住人', description: '## 外見\n**緑色**',
  gmNotes: 'GM_SECRET', tags: ['地下'], attributes: { hp: 7 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
beforeEach(async () => { await db.contentDefinitions.clear(); });
after(async () => { await db.delete(); dom.window.close(); });
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise(r => setTimeout(r, 2)); });
  assert.ok(predicate(), 'state did not settle');
}
async function harness(repo: ContentRepository = repository) {
  let api!: ReturnType<typeof useContentEditor>;
  function Harness() { api = useContentEditor(repo); return null; }
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Harness))); await settle(() => api.ready || !!api.error);
  return { get api() { return api; }, async close() { await act(async () => root.unmount()); container.remove(); } };
}
test('unsaved new drafts stay outside the repository; selection/new/import transitions support cancel, save and discard', async () => {
  await repository.saveMany([fixture()], 'skip'); const ui = await harness();
  try {
    assert.equal((await repository.list()).length, 1); assert.equal(ui.api.dirty, false);
    await act(() => ui.api.patchContent({ name: '旅の商人', kind: 'npc' }));
    assert.equal(ui.api.dirty, true);
    const unload = new dom.window.Event('beforeunload', { cancelable: true }); dom.window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
    await act(() => ui.api.select('monster')); assert.ok(ui.api.pending); assert.equal(ui.api.entry.form.content.name, '旅の商人');
    await act(() => ui.api.resolvePending('cancel')); assert.equal(ui.api.pending, null);
    await act(() => ui.api.select('monster')); await act(() => ui.api.resolvePending('save'));
    assert.equal((await repository.list()).length, 2); assert.equal(ui.api.entry.form.content.id, 'monster');
    await act(() => ui.api.patchContent({ name: '未保存変更' })); await act(() => ui.api.create('event'));
    await act(() => ui.api.resolvePending('discard')); assert.equal(ui.api.entry.form.content.kind, 'event'); assert.equal(ui.api.entry.form.content.name, '');
    let pickerOpened = false; await act(() => ui.api.patchContent({ name: '未保存イベント' }));
    await act(() => ui.api.request(() => { pickerOpened = true; })); assert.equal(pickerOpened, false);
    await act(() => ui.api.resolvePending('cancel')); assert.equal(pickerOpened, false); assert.equal(ui.api.entry.form.content.name, '未保存イベント');
  } finally { await ui.close(); }
});
test('save failure preserves draft, baseline and pending action, then retry can save and continue', async () => {
  let fail = true;
  const ui = await harness({ ...repository, save: async (...args) => { if (fail) throw new Error('容量不足'); return repository.save(...args); } });
  try {
    await act(() => ui.api.patchContent({ name: '保持する原稿' })); await act(() => ui.api.create('trap'));
    await act(() => ui.api.resolvePending('save')); assert.match(ui.api.error, /容量不足/); assert.ok(ui.api.pending);
    assert.equal(ui.api.entry.form.content.name, '保持する原稿'); assert.equal(ui.api.entry.baseline, null); assert.equal(ui.api.dirty, true);
    fail = false; await act(() => ui.api.resolvePending('save')); assert.equal(ui.api.entry.form.content.kind, 'trap');
    assert.equal(ui.api.pending, null); assert.equal((await repository.list())[0].name, '保持する原稿');
  } finally { await ui.close(); }
});
test('two windows refresh clean drafts but preserve dirty edits and reject stale save/delete after notifications', async () => {
  await repository.saveMany([fixture()], 'skip'); const one = await harness(), two = await harness();
  try {
    await act(() => one.api.select('monster')); await act(() => two.api.select('monster'));
    await act(() => one.api.patchContent({ name: '一つ目で更新' })); await act(() => one.api.save());
    await settle(() => two.api.entry.form.content.name === '一つ目で更新');
    await act(() => two.api.patchContent({ name: '二つ目の未保存' }));
    const stale = two.api.entry.baseline!;
    await act(() => one.api.patchContent({ name: 'さらに更新' })); await act(() => one.api.save());
    await settle(() => two.api.items.some(c => c.name === 'さらに更新'));
    assert.equal(two.api.entry.form.content.name, '二つ目の未保存'); assert.equal(two.api.entry.baseline?.updatedAt, stale.updatedAt);
    assert.match(two.api.notice, /保持/);
    await act(() => two.api.save()); assert.match(two.api.error, /別ウィンドウ/); assert.equal(two.api.entry.form.content.name, '二つ目の未保存');
    await act(() => two.api.deleteCurrent()); assert.match(two.api.error, /別ウィンドウ/);
    assert.equal((await repository.get('monster'))!.name, 'さらに更新');
  } finally { await one.close(); await two.close(); }
  assert.equal([...Channel.instances].filter(c => c.name === 'trpg-dungeon-generator-contents').length, 0);
});
test('external deletion clears a clean draft and focus refresh recovers a missed notification', async () => {
  await repository.saveMany([fixture()], 'skip'); const ui = await harness();
  try {
    await act(() => ui.api.select('monster'));
    const silent = createContentRepository(db, () => {}), value = (await silent.get('monster'))!;
    await silent.delete(value.id, value.updatedAt);
    await act(() => dom.window.dispatchEvent(new dom.window.Event('focus')));
    await settle(() => ui.api.entry.baseline === null); assert.match(ui.api.notice, /削除/);
  } finally { await ui.close(); }
});
test('Import parses safely, rolls back failure, reports collisions, preserves GM data, and retries without losing input', async () => {
  await repository.saveMany([fixture()], 'skip'); let fail = true;
  const ui = await harness({ ...repository, saveMany: async (...args) => { if (fail) throw new Error('Import保存失敗'); return repository.saveMany(...args); } });
  const json = JSON.stringify(buildContentExport([{ ...fixture(), name: '別の内容' }, fixture('new')]));
  const file = (text: string) => ({ size: new TextEncoder().encode(text).length, text: async () => text }) as File;
  try {
    await act(() => ui.api.readImport(file('{'))); assert.match(ui.api.error, /JSON構文/); assert.equal(ui.api.incoming, null);
    await act(() => ui.api.readImport(file(json))); assert.equal(ui.api.incoming?.length, 2);
    await act(() => ui.api.importContents('new-id')); assert.match(ui.api.error, /保存失敗/); assert.equal(ui.api.incoming?.length, 2);
    fail = false; await act(() => ui.api.importContents('new-id')); assert.equal(ui.api.incoming, null);
    assert.match(ui.api.notice, /新規登録 2件.*新規ID発行 1件/);
    assert.equal((await repository.list()).length, 3); assert.ok((await repository.list()).every(c => c.gmNotes === 'GM_SECRET'));
  } finally { await ui.close(); }
});
test('list failure keeps editing available and retry restores persistence controls', async () => {
  let fail = true;
  const ui = await harness({ ...repository, list: async () => { if (fail) throw new Error('一覧取得失敗'); return repository.list(); } });
  try {
    assert.equal(ui.api.ready, false); assert.match(ui.api.error, /一覧取得失敗/);
    await act(() => ui.api.patchContent({ name: '保持' })); fail = false; await act(() => ui.api.retry());
    assert.equal(ui.api.ready, true); assert.equal(ui.api.entry.form.content.name, '保持');
  } finally { await ui.close(); }
});

const doc = dom.window.document;
const button = (name: string) => { const b = [...doc.querySelectorAll('button')].find(el => el.textContent === name); assert.ok(b, name); return b; };
const click = (name: string) => act(async () => { button(name).click(); await new Promise(r => setTimeout(r, 5)); });
const field = (name: string) => { const el = doc.querySelector(`[aria-label="${name}"]`); assert.ok(el, name); return el as HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement; };
const input = (name: string, value: string) => act(() => {
  const el = field(name), prototype = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const select = (name: string, value: string) => act(() => { const el = field(name); el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
async function mount(download: typeof import('../src/utils/exportImport').downloadJson = () => {}) {
  const root = createRoot(doc.getElementById('root')!);
  await act(async () => root.render(createElement(ContentEditor, { repository, download })));
  await settle(() => !button('Export JSON').disabled); return () => act(() => root.unmount());
}
test('actual editor creates, previews sanitized Markdown, validates typed attributes and persists corrected values', async () => {
  const close = await mount();
  try {
    await input('コンテンツ名称', '<img src=x onerror=alert(1)>小鬼'); await input('コンテンツタグ', ' 地下, 地下, fantasy');
    await input('公開説明（Markdown）', '## 公開見出し\n**強調** <script>alert(1)</script><img src=x onerror=alert(1)><iframe src=x></iframe>[危険](javascript:alert(1))');
    const preview = field('公開説明のプレビュー'); assert.ok(preview.querySelector('h2')); assert.ok(preview.querySelector('strong'));
    assert.equal(preview.querySelector('script,img,iframe,[onerror],a[href^="javascript:"]'), null);
    await click('GM専用情報'); await input('GM専用情報（Markdown）', '## GM_SECRET');
    await click('公開説明'); assert.match(field('公開説明（Markdown）').value, /公開見出し/);
    await click('属性追加'); await input('属性1のキー', 'hp'); await input('属性1の値', '1d6'); await select('属性1の型', 'number');
    assert.equal(field('属性1の値').value, '1d6'); assert.equal(button('保存').disabled, true); assert.match(doc.body.textContent!, /有限数値/);
    await input('属性1の値', '12'); await click('保存'); await settle(() => doc.body.textContent!.includes('保存しました。'));
    const stored = (await repository.list())[0]; assert.equal(stored.attributes.hp, 12); assert.equal(stored.gmNotes, '## GM_SECRET');
    assert.deepEqual(stored.tags, ['地下', 'fantasy']); assert.ok(!doc.querySelector('aside img'));
  } finally { await close(); }
});
test('actual editor exports current, checked, filtered and all saved contents; pagination bounds list rendering', async () => {
  const values = Array.from({ length: 61 }, (_, n) => ({ ...fixture(`id-${n}`), name: `素材${String(n).padStart(2, '0')}`, kind: CONTENT_KINDS[n % 6], tags: ['地下'] }));
  await repository.saveMany(values, 'skip'); const exports: unknown[] = [], close = await mount(data => { exports.push(data); });
  try {
    assert.equal(doc.querySelectorAll('aside article').length, 50); await click('次の50件'); assert.equal(doc.querySelectorAll('aside article').length, 11);
    await input('コンテンツ検索', '素材00'); await settle(() => doc.querySelectorAll('aside article').length === 1);
    const item = doc.querySelector<HTMLButtonElement>('aside .content-item')!; await act(() => item.click()); await settle(() => field('コンテンツ名称').value === '素材00');
    await click('Export JSON'); await settle(() => exports.length === 1);
    assert.equal((exports[0] as { type: string }).type, 'content-definition');
    await act(() => doc.querySelector<HTMLInputElement>('aside article input')!.click()); await select('コンテンツの出力対象', 'selected'); await click('Export JSON');
    await settle(() => exports.length === 2); assert.equal((exports[1] as { contents: unknown[] }).contents.length, 1);
    await select('コンテンツの出力対象', 'filtered'); await click('Export JSON'); await settle(() => exports.length === 3);
    assert.equal((exports[2] as { contents: unknown[] }).contents.length, 1);
    await select('コンテンツの出力対象', 'all'); await click('Export JSON'); await settle(() => exports.length === 4);
    assert.equal((exports[3] as { contents: unknown[] }).contents.length, 61);
    await input('コンテンツ検索', ''); await select('コンテンツ種別フィルター', 'event'); assert.equal(doc.querySelectorAll('aside article').length, 10);
    await click('削除'); assert.ok(doc.querySelector('[role="dialog"]')); assert.equal((await repository.list()).length, 61);
    await click('キャンセル'); await click('削除'); await click('削除を確定'); await settle(() => doc.body.textContent!.includes('削除しました。'));
    assert.equal((await repository.list()).length, 60);
  } finally { await close(); }
});

test('a populated library stays out of publication artifacts, allowing only the Entity schema migration in project JSON', async () => {
  const sentinel = 'CONTENT_LIBRARY_PRIVATE_SENTINEL';
  await repository.saveMany(CONTENT_KINDS.map(kind => ({ ...fixture(kind), kind, name: sentinel, summary: sentinel,
    description: sentinel, gmNotes: sentinel, tags: [sentinel], attributes: { secret: sentinel } })), 'skip');
  const { createArtifactGenerator } = await import('../src/publishing/package/artifactGenerator');
  const { buildPackagePlan } = await import('../src/publishing/package/packagePlan');
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/publication-baseline.json', import.meta.url), 'utf8')) as Record<string, string>;
  const { source, settings, profile } = publicationFixture(), plan = buildPackagePlan(profile, source);
  assert.ok(plan.artifacts.every(r => !r.path.includes('content-library')));
  const generator = createArtifactGenerator(source, settings, profile.title, true, undefined, fixtureTimestamp);
  for (const request of plan.artifacts.filter(r => Object.hasOwn(baseline, r.path))) {
    const artifact = await generator.generate(request);
    assert.equal(createHash('sha256').update(publicationBaselineData(request.path, artifact.data)).digest('hex'), baseline[request.path], request.path);
    assert.ok(!new TextDecoder().decode(artifact.data).includes(sentinel));
  }
});
