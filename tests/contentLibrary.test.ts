import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from '../src/db/db';
import { CONTENT_KINDS, CONTENT_LIMITS, newContent, normalizeContent, duplicateContent, contentAttributes, sameContent } from '../src/model/content';
import type { ContentDefinition } from '../src/model/content';
import { buildContentExport, parseContentJson, contentFilename } from '../src/content/contentJson';
import { toContentForm, fromContentForm } from '../src/content/contentForm';
import { searchContents } from '../src/content/contentSearch';
import { createContentRepository } from '../src/repository/contentRepository';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope } from '../src/utils/exportImport';

let notices = 0;
const repository = createContentRepository(db, () => { notices++; });
const fixture = (id = 'monster-洞窟'): ContentDefinition => ({ id, kind: 'monster', name: '洞窟の小鬼', summary: 'Undergroundの住人',
  description: '## 外見\n緑色の小柄な生物。', gmNotes: '秘密GM_MARKER', tags: ['fantasy', '地下'], attributes: { hp: 7, damage: '1d6', undead: false },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
beforeEach(async () => { await db.contentDefinitions.clear(); notices = 0; });
after(async () => { await db.delete(); });

for (const kind of CONTENT_KINDS) test(`valid ${kind} preserves ID and allows empty Markdown and attributes`, () => {
  const value = { ...fixture(), kind, description: '', gmNotes: '', attributes: {} };
  assert.deepEqual(normalizeContent(value), value);
  const fresh = newContent(kind); assert.equal(fresh.kind, kind); assert.ok(fresh.id); assert.ok(!('createdAt' in fresh));
});
for (const [field, value] of [
  ['id', ''], ['name', ' '], ['kind', 'dragon'], ['summary', 1], ['description', null], ['gmNotes', []], ['tags', [1]],
  ['attributes', []], ['createdAt', '2026-02-30T00:00:00.000Z'], ['updatedAt', 'nonsense'],
  ['name', 'x'.repeat(CONTENT_LIMITS.name + 1)], ['summary', 'x'.repeat(CONTENT_LIMITS.summary + 1)],
  ['description', 'x'.repeat(CONTENT_LIMITS.markdown + 1)], ['gmNotes', 'x'.repeat(CONTENT_LIMITS.markdown + 1)],
  ['id', 'x'.repeat(CONTENT_LIMITS.id + 1)], ['tags', Array(51).fill('x')], ['tags', ['x'.repeat(65)]],
] as const) test(`content validation rejects ${field} (${String(value).slice(0, 25)})`, () => {
  assert.throws(() => normalizeContent({ ...fixture(), [field]: value }));
});
test('dates are real, ordered ISO timestamps; tags trim and deduplicate case-sensitively without mutating input', () => {
  assert.throws(() => normalizeContent({ ...fixture(), updatedAt: '2025-01-01T00:00:00.000Z' }));
  const value = { ...fixture(), tags: [' 地下 ', '', '地下', 'Fantasy', 'fantasy'] }, before = structuredClone(value);
  assert.deepEqual(normalizeContent(value).tags, ['地下', 'Fantasy', 'fantasy']); assert.deepEqual(value, before);
});
test('attributes support scalar types, preserve insertion order and reject invalid keys/values/counts', () => {
  assert.deepEqual(contentAttributes([[' hp ', 7], ['damage', '1d6'], ['undead', false]]), fixture().attributes);
  for (const entries of [ [['', 1]], [['hp', 1], [' hp ', 2]], [['__proto__', 1]], [['prototype', 1]], [['constructor', true]],
    [['n', NaN]], [['n', Infinity]], [['n', null]], [['n', []]], [['n', {}]], [['n', undefined]],
    [['x'.repeat(101), 1]], [['n', 'x'.repeat(4001)]], Array.from({ length: 101 }, (_, n) => [`k${n}`, 1]) ]) {
    assert.throws(() => contentAttributes(entries as [string, unknown][]));
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test('form edits add/remove/rename attributes, retain text during incompatible type changes and reject duplicate keys', () => {
  const form = toContentForm(fixture()); form.rows.push({ key: 'alive', type: 'boolean', value: 'true' });
  form.rows[0].key = 'health'; form.rows = form.rows.filter(r => r.key !== 'undead');
  form.tagsText = ' 地下, 地下, fantasy';
  const saved = fromContentForm(form); assert.deepEqual(saved.attributes, { health: 7, damage: '1d6', alive: true });
  assert.deepEqual(saved.tags, ['地下', 'fantasy']);
  const row = form.rows[1]; row.type = 'number'; assert.throws(() => fromContentForm(form), /有限数値/); assert.equal(row.value, '1d6');
  row.value = '1e2'; assert.equal(fromContentForm(form).attributes.damage, 100);
  row.type = 'boolean'; assert.throws(() => fromContentForm(form), /true/); assert.equal(row.value, '1e2');
  row.value = 'false'; assert.equal(fromContentForm(form).attributes.damage, false);
  row.key = 'health'; assert.throws(() => fromContentForm(form), /重複/);
  row.key = 'other'; row.type = 'number'; row.value = ' '; assert.throws(() => fromContentForm(form));
});
test('duplicates get an independent ID, arrays and attributes; timestamps wait until first save', () => {
  const original = fixture(), copy = duplicateContent(original);
  assert.notEqual(copy.id, original.id); assert.match(copy.name, /複製/);
  copy.tags.push('copy'); copy.attributes.hp = 99;
  assert.equal(original.tags.length, 2); assert.equal(original.attributes.hp, 7);
  assert.equal(copy.gmNotes, original.gmNotes); assert.equal(copy.description, original.description);
  assert.ok(!('createdAt' in copy));
});
test('editing imported tags containing delimiters or quotes preserves them and rejects unterminated quotes', () => {
  const value = { ...fixture(), tags: ['地下,廃坑', '神殿、洞窟', '改行\nタグ', '引用"タグ'] };
  const form = toContentForm(value); assert.deepEqual(fromContentForm(form).tags, value.tags);
  form.tagsText = '"閉じていない'; assert.throws(() => fromContentForm(form), /引用符/);
  form.tagsText = '"地下"unexpected'; assert.throws(() => fromContentForm(form), /カンマ/);
});
test('Japanese/English search matches name, summary, tags and combines kind without modifying input', () => {
  const values = [fixture(), { ...fixture('treasure'), kind: 'treasure' as const, name: '銀の聖杯', summary: 'Rare Cup', tags: ['silver'] }], before = structuredClone(values);
  for (const q of ['小鬼', 'UNDERGROUND', 'FANTASY', '地下']) assert.deepEqual(searchContents(values, q, '').map(c => c.id), [values[0].id]);
  assert.equal(searchContents(values, 'rare', 'treasure').length, 1); assert.equal(searchContents(values, 'rare', 'monster').length, 0);
  assert.equal(searchContents(values, '不存在', '').length, 0); assert.equal(searchContents(values, '', '').length, 2);
  assert.deepEqual(values, before);
});
test('repository creates and updates with stable ID/createdAt, survives reopen, and deletes with a revision', async () => {
  const value = await repository.save(fixture(), null); assert.equal(notices, 1);
  assert.notEqual(value.createdAt, fixture().createdAt); assert.equal(value.createdAt, value.updatedAt);
  const changed = await repository.save({ ...value, name: '旅の商人', kind: 'npc' }, value.updatedAt);
  assert.equal(changed.id, value.id); assert.equal(changed.createdAt, value.createdAt); assert.ok(changed.updatedAt > value.updatedAt);
  db.close(); await db.open(); assert.deepEqual(await repository.get(value.id), changed);
  assert.deepEqual(await repository.list(), [changed]);
  await repository.delete(value.id, changed.updatedAt); assert.equal(await repository.get(value.id), undefined); assert.equal(notices, 3);
});
test('concurrent edits, stale deletes, ID collisions and deleted drafts never overwrite current data', async () => {
  const original = await repository.save(fixture(), null);
  const results = await Promise.allSettled([repository.save({ ...original, name: 'one' }, original.updatedAt), repository.save({ ...original, name: 'two' }, original.updatedAt)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  await assert.rejects(repository.save(original, null), /別ウィンドウ/);
  await assert.rejects(repository.delete(original.id, original.updatedAt), /別ウィンドウ/);
  const latest = (await repository.get(original.id))!;
  await repository.delete(latest.id, latest.updatedAt);
  await assert.rejects(repository.save(latest, latest.updatedAt), /別ウィンドウ/);
  assert.equal((await repository.list()).length, 0);
});
test('single/library JSON round trips Japanese, exact IDs, scalar types and GM data without modifying source', () => {
  const values = CONTENT_KINDS.map((kind, n) => ({ ...fixture(`id-${n}`), kind })), before = structuredClone(values);
  assert.deepEqual(parseContentJson(JSON.stringify(buildContentExport([values[0]], true))), [values[0]]);
  assert.deepEqual(parseContentJson(JSON.stringify(buildContentExport(values))), values);
  assert.deepEqual(values, before); assert.equal(contentFilename('../祭壇:<秘密>\n'), '.._祭壇__秘密__.content.json');
  assert.equal(contentFilename('CON'), '_CON.content.json');
});
test('JSON rejects malformed, unknown schema/type, duplicate IDs/keys (including escaped keys), dangerous keys and limits', () => {
  const single = JSON.stringify(buildContentExport([fixture()], true));
  for (const json of ['{', 'null', '[]', single.replace('1.0.0', '99.0.0'), single.replace('content-definition', 'dungeon'),
    single.replace('"hp":7', '"hp":7,"h\\u0070":8'), single.replace('"hp":7', '"__proto__":7'),
    JSON.stringify({ schemaVersion: '1.0.0', type: 'content-library', contents: [fixture(), fixture()] }),
    JSON.stringify({ schemaVersion: '1.0.0', type: 'content-library', contents: Array(1001).fill(fixture()) }),
    ' '.repeat(CONTENT_LIMITS.importBytes + 1)]) assert.throws(() => parseContentJson(json));
  // Punctuation inside strings is never mistaken for JSON structure.
  const punctuation = { ...fixture(), description: '"hp":1, [ { } ] \\ 雪' };
  assert.deepEqual(parseContentJson(JSON.stringify(buildContentExport([punctuation], true))), [punctuation]);
});
test('import reuses identical definitions ignoring timestamps/order and explicitly skips or reidentifies conflicts', async () => {
  const source = fixture(); await repository.saveMany([source], 'skip');
  const reordered = { ...source, updatedAt: '2026-02-01T00:00:00.000Z', tags: [...source.tags].reverse(), attributes: { undead: false, damage: '1d6', hp: 7 } };
  assert.ok(sameContent(source, reordered));
  assert.deepEqual(await repository.saveMany([reordered], 'skip'), { added: 0, reused: 1, skipped: 0, reidentified: 0 });
  const conflict = { ...source, name: '異なる小鬼' };
  assert.deepEqual(await repository.saveMany([conflict], 'skip'), { added: 0, reused: 0, skipped: 1, reidentified: 0 });
  assert.deepEqual(await repository.saveMany([conflict], 'new-id'), { added: 1, reused: 0, skipped: 0, reidentified: 1 });
  assert.deepEqual(await repository.get(source.id), source);
  const copy = (await repository.list()).find(c => c.id !== source.id)!;
  assert.equal(copy.name, conflict.name); assert.notEqual(copy.createdAt, source.createdAt); assert.equal(notices, 2);
});
test('batch validation and failed writes roll back the entire import and publish no success notification', async () => {
  await assert.rejects(repository.saveMany([fixture('a'), { ...fixture('b'), name: '' }], 'skip'));
  assert.equal((await repository.list()).length, 0); assert.equal(notices, 0);
  const rejectSecond = (_key: unknown, obj: ContentDefinition) => { if (obj.id === 'b') throw new Error('QuotaExceededError'); };
  db.contentDefinitions.hook('creating', rejectSecond);
  try { await assert.rejects(repository.saveMany([fixture('a'), fixture('b')], 'skip'), /QuotaExceededError/); }
  finally { db.contentDefinitions.hook('creating').unsubscribe(rejectSecond); }
  assert.equal((await repository.list()).length, 0); assert.equal(notices, 0);
});
test('library mutations leave the active dungeon, history and exported project schema untouched', async () => {
  const state = useDungeonStore.getState(), before = structuredClone({ dungeon: state.dungeon, undo: state.undoStack, redo: state.redoStack });
  const exported = buildExportEnvelope(state.dungeon);
  const saved = await repository.save({ ...fixture(), name: 'LIBRARY_SECRET_SENTINEL' }, null);
  await repository.saveMany([fixture('other')], 'skip'); await repository.delete(saved.id, saved.updatedAt);
  const latest = useDungeonStore.getState();
  assert.deepEqual({ dungeon: latest.dungeon, undo: latest.undoStack, redo: latest.redoStack }, before);
  const nextExport = buildExportEnvelope(latest.dungeon);
  assert.deepEqual({ ...nextExport, exportedAt: exported.exportedAt }, exported); assert.ok(!JSON.stringify(exported).includes('LIBRARY_SECRET_SENTINEL'));
  assert.ok(!('contents' in latest.dungeon));
});
