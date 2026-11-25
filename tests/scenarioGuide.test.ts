import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DungeonDocument, PlacedRoom } from '../src/model/types';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { emptyRoomInformation } from '../src/model/roomInformation';
import { buildPublishDocument, buildScenarioPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { defaultScenarioGuideOptions, compareRoomNumbers, MAX_GUIDE_ROOMS, MAX_MARKDOWN_CHARS, MAX_GUIDE_TEXT_CHARS, roomAnchor } from '../src/publishing/scenario/scenarioGuide';
import { buildScenarioGuide, renderScenarioMap } from '../src/publishing/scenario/scenarioGuideBuilder';
import { scenarioPreviewHtml } from '../src/publishing/scenario/scenarioPreviewHtml';
import { snapshotWithSavedMarkdown } from '../src/publishing/publishSnapshot';
import { exportFilename } from '../src/publishing/exporters';
import { db } from '../src/db/db';
import { dungeonRepository } from '../src/repository/dungeonRepository';
import { useDungeonStore } from '../src/store/dungeonStore';
import { buildExportEnvelope, parseImport } from '../src/utils/exportImport';

// Real DOMPurify against a DOM, not a sanitizer mock. No resources/scripts enabled.
const dom = new JSDOM('');
Object.assign(globalThis, { window: dom.window });
const { renderMarkdownToHtml } = await import('../src/editor/markdown/markdownRender');
const { renderScenarioHtml, createScenarioHtmlRenderer } = await import('../src/publishing/scenario/scenarioHtmlRenderer');
const { renderPublishSvg } = await import('../src/publishing/PublishMapRenderer');

const room = (id: string, number = '01', x = 0): PlacedRoom => ({ id, pieceId: DEFAULT_PIECES[0].id, piece: structuredClone(DEFAULT_PIECES[0]),
  position: { x, y: 0 }, rotation: 0, information: { ...emptyRoomInformation(number), name: 'NAME_SECRET_祭壇', description: '公開の説明 **日本語**', gmNotes: 'GM_SECRET_階段', tags: ['TAG_SECRET_undead'] } });
const dungeon = (rooms = [room('first'), room('second', '02', 12)]): DungeonDocument => ({ id: 'dungeon-id', name: '古城の地下迷宮', version: '1.2.0',
  rooms, connections: [], markdown: '## GLOBAL_SECRET_概要\n\nGM用の導入', meta: { gridSize: 40 }, createdAt: '', updatedAt: '' });
const options = (audience: 'gm' | 'player' = 'player') => defaultScenarioGuideOptions(audience);
function guide(source = dungeon(), audience: 'gm' | 'player' = 'player', names = audience === 'gm', includeMap = false) {
  const profile = { ...defaultPublishProfile(audience), showRoomNames: names };
  const config = { ...options(audience), includeMap };
  const document = buildScenarioPublishDocument(source, profile, config);
  const map = includeMap ? { audience, svg: renderScenarioMap(buildPublishMapGeometry(buildPublishDocument(source, audience)), document, profile).svg } : undefined;
  return buildScenarioGuide(document, config, map);
}
const parseHtml = (html: string) => new JSDOM(html).window.document;
after(async () => { dom.window.close(); await db.delete(); });

test('guide defaults use one shared audience and never offer player GM fields', () => {
  assert.deepEqual(options('player'), { includeMap: true, includeTableOfContents: true, includeRoomDescriptions: true, includeScenarioMarkdown: false, includeRoomTags: false, includeGmNotes: false });
  assert.equal(options('gm').includeScenarioMarkdown, true); assert.equal(options('gm').includeGmNotes, true); assert.equal(options('gm').includeRoomTags, true);
  assert.ok(!('audience' in options()));
});
test('GM extraction uses placed-room information, preserves source, and includes saved scenario Markdown', () => {
  const source = dungeon(), before = structuredClone(source), result = guide(source, 'gm');
  assert.equal(result.title, source.name); assert.equal(result.scenarioMarkdown, source.markdown);
  assert.equal(result.rooms[0].name, source.rooms[0].information.name); assert.equal(result.rooms[0].gmNotes, 'GM_SECRET_階段');
  assert.deepEqual(result.rooms[0].tags, ['TAG_SECRET_undead']); assert.deepEqual(source, before);
  result.rooms[0].tags!.push('other'); assert.deepEqual(source, before);
});
test('player extraction removes GM, global Markdown, tags, default names and Piece metadata before rendering', () => {
  const source = dungeon(); source.rooms[0].piece.name = 'PIECE_SECRET_素材'; source.rooms[0].piece.tags = ['PIECE_TAG_SECRET'];
  const profile = defaultPublishProfile();
  // Even forged GM-only option flags cannot broaden player information.
  const document = buildScenarioPublishDocument(source, profile, options('gm'));
  assert.doesNotMatch(JSON.stringify(document), /GM_SECRET|GLOBAL_SECRET|TAG_SECRET|NAME_SECRET|PIECE_SECRET|PIECE_TAG_SECRET|gmNotes|scenarioMarkdown|tags/);
  const html = renderScenarioHtml(guide(source));
  assert.doesNotMatch(html, /GM_SECRET|GLOBAL_SECRET|TAG_SECRET|NAME_SECRET|PIECE_SECRET|PIECE_TAG_SECRET/);
});
test('explicit names opt-in applies to guide headings, TOC and embedded map, without Piece name fallback', () => {
  const source = dungeon(); source.rooms[1].information.name = ''; source.rooms[1].piece.name = 'PIECE_SECRET_FALLBACK';
  const hidden = renderScenarioHtml(guide(source, 'player', false, true));
  const visible = renderScenarioHtml(guide(source, 'player', true, true));
  assert.doesNotMatch(hidden, /NAME_SECRET|PIECE_SECRET_FALLBACK/);
  assert.match(visible, /NAME_SECRET_祭壇/); assert.doesNotMatch(visible, /PIECE_SECRET_FALLBACK/);
  const doc = parseHtml(visible); assert.equal(doc.querySelector('article h3')!.textContent, '01. NAME_SECRET_祭壇');
  assert.equal(doc.querySelectorAll('svg text').length, 3); // Two numbers, one explicit name.
});
test('one Piece yields independent room descriptions rather than Piece content', () => {
  const source = dungeon(); source.rooms[1].information.description = 'もう一つの部屋';
  const result = guide(source);
  assert.equal(result.rooms[0].description, source.rooms[0].information.description);
  assert.equal(result.rooms[1].description, 'もう一つの部屋');
});
test('natural room ordering is deterministic for numeric, string, zero-padded and huge labels', () => {
  const values = ['B-01', 'A-10', '11', '03', '02', 'A-02', '01', '10', 'A-01', '9007199254740993', '9007199254740992'];
  const expected = ['01', '02', '03', '10', '11', '9007199254740992', '9007199254740993', 'A-01', 'A-02', 'A-10', 'B-01'];
  assert.deepEqual([...values].sort(compareRoomNumbers), expected);
  const source = dungeon(values.map((n, i) => room(`r-${i}`, n, i * 5))), before = structuredClone(source);
  assert.deepEqual(guide(source).rooms.map(r => r.number), expected); assert.deepEqual(source, before);
  assert.deepEqual(guide({ ...source, rooms: [...source.rooms].reverse() }).rooms.map(r => [r.number, r.anchorId]), guide(source).rooms.map(r => [r.number, r.anchorId]));
  assert.notEqual(compareRoomNumbers('01', '1'), 0);
});
test('empty fields omit empty sections; empty dungeons still produce a complete guide', () => {
  const source = dungeon([room('empty')]); source.markdown = '  '; source.rooms[0].information = emptyRoomInformation('04');
  const html = renderScenarioHtml(guide(source, 'gm'));
  assert.doesNotMatch(html, /公開説明|GM専用情報|class="tags"|guide-overview|正方形/);
  assert.equal(parseHtml(html).querySelector('article h3')!.textContent, '04');
  const empty = parseHtml(renderScenarioHtml(guide(dungeon([]))));
  assert.equal(empty.querySelectorAll('article').length, 0); assert.match(empty.body.textContent!, /部屋がありません/);
});
test('options independently omit map, TOC, public description, GM notes, tags and overview', () => {
  const source = dungeon(), profile = defaultPublishProfile('gm');
  for (const key of ['includeTableOfContents', 'includeRoomDescriptions', 'includeGmNotes', 'includeRoomTags', 'includeScenarioMarkdown'] as const) {
    const config = { ...options('gm'), includeMap: false, [key]: false };
    const html = renderScenarioHtml(buildScenarioGuide(buildScenarioPublishDocument(source, profile, config), config));
    const doc = parseHtml(html);
    const selectors = { includeTableOfContents: 'nav', includeRoomDescriptions: 'article section:not(.gm-notes)', includeGmNotes: '.gm-notes', includeRoomTags: '.tags', includeScenarioMarkdown: '#guide-overview' };
    assert.equal(doc.querySelector(selectors[key]), null);
  }
});
test('safe anchors survive name/number changes and never collide with Markdown-supplied heading IDs', () => {
  const source = dungeon(); source.rooms[0].information.description = '<h2 id="guide-map">Markdown</h2>\n\n## 見出し';
  const first = guide(source, 'gm'), anchors = first.rooms.map(r => r.anchorId);
  source.rooms[0].information.name = '改名'; source.rooms[0].information.number = 'B-01';
  assert.equal(guide(source, 'gm').rooms.find(r => r.number === 'B-01')!.anchorId, anchors[0]);
  assert.match(roomAnchor('日本語 "<ID>'), /^guide-room-[a-f\d]{16}$/);
  const doc = parseHtml(renderScenarioHtml(first)), ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const anchor of doc.querySelectorAll('nav a')) assert.equal(doc.querySelectorAll(anchor.getAttribute('href')!).length, 1);
  assert.throws(() => guide(dungeon([room('same'), room('same', '02')])));
});
test('Markdown retains Japanese headings, lists, tables, quotes, fenced code, emphasis and safe links', () => {
  const markdown = '# 日本語\n\n段落 **太字** *斜体*\n\n- 項目\n\n1. 番号\n\n| 列 | 値 |\n| -- | -- |\n| A | B |\n\n> 引用\n\n```js\nconst x = "<script>";\n```\n\n[リンク](https://example.com/)';
  const html = renderMarkdownToHtml(markdown, true), doc = parseHtml(html);
  for (const tag of ['h1', 'p', 'strong', 'em', 'ul', 'ol', 'table', 'blockquote', 'pre', 'code', 'a']) assert.ok(doc.querySelector(tag), tag);
  assert.equal(doc.querySelector('a')!.getAttribute('href'), 'https://example.com/');
  assert.equal(doc.querySelector('script'), null); assert.equal(renderMarkdownToHtml('', true), '');
});
test('publication sanitizer rejects active content, resource fetching, hidden styles and dangerous URL schemes', () => {
  const input = `<script>alert(1)</script><iframe src="https://tracker.invalid"></iframe><object data="https://tracker.invalid"></object><embed src="x">
<style>body{background:url(https://tracker.invalid)}</style><link rel="stylesheet" href="https://tracker.invalid">
<img src="https://tracker.invalid/pixel" onerror="alert(1)"><video src="https://tracker.invalid" poster="https://tracker.invalid"></video>
<svg><image href="https://tracker.invalid"/><a href="javascript:alert(1)">X</a></svg>
<span id="guide-map" name="parent" data-secret="X" aria-label="X" style="display:none" onclick="alert(1)">本文</span>
[JS](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [file](file:///etc/passwd) [relative](//tracker.invalid/pixel)
![image](https://tracker.invalid/pixel) [safe](https://example.com/) [mail](mailto:test@example.com)`;
  const html = renderMarkdownToHtml(input, true), doc = parseHtml(html);
  assert.equal(doc.querySelectorAll('script,iframe,object,embed,style,link,img,video,svg,form,input').length, 0);
  for (const element of doc.querySelectorAll('*')) for (const attr of element.attributes) {
    assert.ok(!/^(on|src|style|id|name|data-|aria-)/i.test(attr.name));
    if (attr.name === 'href') assert.match(attr.value, /^(https?:\/\/|mailto:|#)/);
  }
  assert.doesNotMatch(html, /tracker\.invalid|javascript:|data:text|file:\/\/|display:none/);
});
test('normal Markdown-editor mode keeps its existing supported image rendering', () => {
  assert.match(renderMarkdownToHtml('![表示](https://example.com/image.png)'), /<img/);
  assert.doesNotMatch(renderMarkdownToHtml('<script>alert(1)</script>'), /<script/);
});
test('HTML is complete, self-contained and escaped; GM notes have an explicit label', () => {
  const source = dungeon(); source.name = '<script>タイトル & 引用</script>'; source.rooms[0].information.name = '<img src=x onerror=alert(1)>';
  source.rooms[0].information.tags = ['<svg/onload=alert(1)>'];
  const html = renderScenarioHtml(guide(source, 'gm', true, true)), doc = parseHtml(html);
  assert.match(html, /^<!DOCTYPE html>/); assert.equal(doc.documentElement.lang, 'ja');
  assert.equal(doc.querySelector('meta[charset]')!.getAttribute('charset'), 'UTF-8'); assert.ok(doc.querySelector('meta[name=viewport]'));
  assert.equal(doc.querySelector('h1')!.textContent, source.name);
  assert.equal(doc.querySelectorAll('script,img,link,iframe,object,embed').length, 0);
  assert.ok(doc.querySelector('svg')); assert.ok(doc.querySelector('.gm-notes h4')!.textContent!.includes('GM専用情報'));
  assert.match(doc.querySelector('style')!.textContent!, /@media print/); assert.match(doc.querySelector('style')!.textContent!, /break-after: avoid/);
  assert.ok(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!.includes("default-src 'none'"));
});
test('player HTML, TOC and inline SVG never contain private sentinels or excluded secret routes', () => {
  const source = dungeon(); source.connections.push({ id: 'SECRET_CONNECTION_MARKER', fromRoomId: 'first', toRoomId: 'second',
    fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west', type: 'secret' });
  const html = renderScenarioHtml(guide(source, 'player', false, true));
  assert.doesNotMatch(html, /NAME_SECRET|GM_SECRET|GLOBAL_SECRET|TAG_SECRET|SECRET_CONNECTION_MARKER|#7c3aed|#dc2626|stroke-dasharray|data-/);
  const doc = parseHtml(html); assert.equal(doc.querySelectorAll('svg text').length, 2);
  assert.equal(doc.querySelectorAll('nav a[href^="#guide-room-"]').length, 2);
  assert.doesNotMatch(doc.querySelector('svg')!.outerHTML, /正方形/);
});
test('guides can omit a failed map, and player map warnings never enter HTML', () => {
  const source = dungeon(); source.rooms[0].pieceId = 'invalid';
  assert.throws(() => buildPublishDocument(source, 'player'));
  assert.ok(renderScenarioHtml(guide(source)).includes('公開の説明'));
  const config = options(), pub = buildScenarioPublishDocument(source, defaultPublishProfile(), config);
  assert.throws(() => buildScenarioGuide(pub, config), /マップを生成できません/);
  assert.throws(() => buildScenarioGuide(pub, config, { audience: 'gm', svg: '<svg/>' }), /出力対象/);
  const blocked = dungeon(); blocked.connections = [{ id: 'public', fromRoomId: 'first', toRoomId: 'second', fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west', type: 'corridor' }];
  blocked.rooms.push(room('block', '03', 4));
  const html = renderScenarioHtml(guide(blocked, 'player', false, true)); assert.doesNotMatch(html, /#dc2626|未解決|警告|routing-status/);
});
test('rendering a guide does not change or re-route the shared map geometry', () => {
  const source = dungeon(), profile = defaultPublishProfile('gm'), config = options('gm');
  const mapDocument = buildPublishDocument(source, 'gm'), geometry = buildPublishMapGeometry(mapDocument), scene = geometry.scene;
  const before = renderPublishSvg(geometry, profile).svg;
  const publication = buildScenarioPublishDocument(source, profile, config);
  renderScenarioMap(geometry, publication, profile);
  assert.equal(geometry.scene, scene); assert.equal(renderPublishSvg(geometry, profile).svg, before);
  assert.throws(() => renderScenarioMap(geometry, { ...publication, audience: 'player' }, profile));
});
test('cached HTML uses identical output for preview/export without changing guide data', () => {
  const value = guide(), before = structuredClone(value), render = createScenarioHtmlRenderer();
  const first = render(value); assert.equal(render(value), first); assert.deepEqual(value, before);
  assert.equal(render({ ...value, includeTableOfContents: false }).includes('<nav'), false);
  assert.equal(render(value), first);
});
test('size guards reject oversized rooms/text and invalid options before Markdown processing', () => {
  const profile = defaultPublishProfile(), config = { ...options(), includeMap: false };
  assert.throws(() => buildScenarioPublishDocument(dungeon(Array.from({ length: MAX_GUIDE_ROOMS + 1 }, (_, i) => room(`r${i}`))), profile, config), /部屋まで/);
  const huge = dungeon(); huge.rooms[0].information.description = 'x'.repeat(MAX_MARKDOWN_CHARS + 1);
  assert.throws(() => buildScenarioPublishDocument(huge, profile, config), /文字以内/);
  const total = dungeon(Array.from({ length: 12 }, (_, i) => ({ ...room(`r${i}`, `${i}`), information: { ...emptyRoomInformation(`${i}`), description: 'x'.repeat(MAX_GUIDE_TEXT_CHARS / 10) } })));
  assert.throws(() => buildScenarioPublishDocument(total, profile, config), /全体のテキスト/);
  assert.throws(() => buildScenarioPublishDocument(dungeon(), profile, { ...config, includeMap: 1 } as never), /出力設定/);
  assert.throws(() => buildScenarioPublishDocument(dungeon(), { ...profile, showRoomNames: 'yes' } as never, config), /出力設定/);
  assert.throws(() => renderScenarioHtml({ ...guide(), mapSvg: 'x'.repeat(8 * 1024 * 1024) }), /8MiB/);
});
test('HTML export filenames reuse normalization and distinguish audiences', () => {
  assert.equal(exportFilename('古城/地下', 'player', 'html'), '古城_地下-player-guide.html');
  assert.equal(exportFilename('古城', 'gm', 'html'), '古城-gm-guide.html');
});
test('srcdoc preview adapts only fragment targets so TOC links stay inside the guide', () => {
  const exported = renderScenarioHtml(guide()), preview = scenarioPreviewHtml(exported);
  assert.equal(preview.replaceAll('href="about:srcdoc#', 'href="#'), exported);
  const doc = parseHtml(preview);
  for (const link of doc.querySelectorAll('nav a')) assert.match(link.getAttribute('href')!, /^about:srcdoc#guide-/);
  assert.equal(scenarioPreviewHtml('<a href="https://example.com/">外部</a>'), '<a href="https://example.com/">外部</a>');
});
test('snapshot reads saved Markdown only, retaining current unsaved rooms and title without mutation', async () => {
  const live = dungeon(), before = structuredClone(live);
  const snapshot = snapshotWithSavedMarkdown(live, async id => { assert.equal(id, live.id); return { ...live, name: '古い名称', rooms: [], markdown: '保存済みの最新Markdown' }; });
  live.rooms[0].information.description = '起動後の編集';
  const result = await snapshot;
  assert.equal(result.markdown, '保存済みの最新Markdown'); assert.equal(result.rooms[0].information.description, before.rooms[0].information.description);
  assert.equal(result.name, before.name); assert.equal(result.rooms.length, before.rooms.length);
  const missing = await snapshotWithSavedMarkdown(before, async () => undefined); assert.deepEqual(missing, before); assert.notEqual(missing, before);
  await assert.rejects(snapshotWithSavedMarkdown(before, async () => ({ ...before, id: 'wrong' })));
});
test('guide publishing preserves repositories, Piece definitions, history, Markdown and JSON compatibility', async () => {
  useDungeonStore.getState().newDungeon(); useDungeonStore.getState().addRoom(room('one'));
  const state = useDungeonStore.getState(), source = state.dungeon;
  await dungeonRepository.save({ ...source, markdown: '最新の保存済みMarkdown' });
  const saved = await db.dungeons.toArray(), pieces = await db.pieceLibrary.toArray(), undo = structuredClone(state.undoStack), redo = structuredClone(state.redoStack), before = structuredClone(source);
  const snapshot = await snapshotWithSavedMarkdown(source, id => dungeonRepository.load(id));
  renderScenarioHtml(guide(snapshot, 'gm', true, true)); renderScenarioHtml(guide(snapshot, 'player', false, true));
  assert.equal(useDungeonStore.getState().dungeon, source); assert.deepEqual(source, before);
  assert.deepEqual(useDungeonStore.getState().undoStack, undo); assert.deepEqual(useDungeonStore.getState().redoStack, redo);
  assert.deepEqual(await db.dungeons.toArray(), saved); assert.deepEqual(await db.pieceLibrary.toArray(), pieces);
  assert.deepEqual(parseImport(JSON.parse(JSON.stringify(buildExportEnvelope(source)))).dungeon, source);
});
