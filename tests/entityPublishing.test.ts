import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { unzipSync } from 'fflate';
import { CONTENT_KINDS } from '../src/model/content';
import { createEntityInstance } from '../src/model/entity';
import { contentFixture, entityDungeon } from './fixtures/entityFixture';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { defaultScenarioGuideOptions } from '../src/publishing/scenario/scenarioGuide';
import { buildScenarioPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { defaultPieceSheetSelection } from '../src/publishing/pieceSheet/inventory';
import { defaultPackageProfile } from '../src/publishing/package/packagePlan';
import { parseDungeonJson } from '../src/utils/exportImport';
import { db } from '../src/db/db';

const dom = new JSDOM(''); Object.assign(globalThis, { window: dom.window });
const { createPublicationSession } = await import('../src/publishing/publicationSession');
const { createPackageBuilder } = await import('../src/publishing/package/buildPackage');
const { renderScenarioHtml } = await import('../src/publishing/scenario/scenarioHtmlRenderer');
const { dungeonRepository } = await import('../src/repository/dungeonRepository');
after(async () => { await db.delete(); dom.window.close(); });
function source() {
  const dungeon = entityDungeon();
  dungeon.entities = CONTENT_KINDS.map(kind => ({ ...createEntityInstance('room-0', contentFixture(kind), dungeon.rooms, 912345),
    id: `ENTITY_PRIVATE_INSTANCE_${kind}`, customName: `ENTITY_PRIVATE_CUSTOM_${kind}`, gmNotes: 'ENTITY_PRIVATE_INSTANCE_GM',
    visibility: kind === 'treasure' || kind === 'event' ? 'public' as const : 'gm-only' as const,
    publicDescription: kind === 'treasure' ? '祭壇の横に**銀の聖杯**が置かれている。' : '' }));
  return dungeon;
}
test('GM guide groups all six kinds and separates definition, instance, attributes and quantities', () => {
  const value = source(), session = createPublicationSession(value), options = { ...defaultScenarioGuideOptions('gm'), includeMap: false };
  const html = session.guide(defaultPublishProfile('gm'), options).html, page = new JSDOM(html);
  try {
    for (const label of ['Monster', 'Treasure', 'Trap', 'Object', 'NPC', 'Event']) assert.ok([...page.window.document.querySelectorAll('h4')].some(h => h.textContent === label));
    assert.equal(page.window.document.querySelectorAll('h5').length, 6); assert.match(html, /912345/);
    assert.match(html, /素材のGM情報/); assert.match(html, /配置固有のGM情報/);
    for (const sentinel of ['ENTITY_PRIVATE_CUSTOM', 'ENTITY_PRIVATE_SUMMARY', 'ENTITY_PRIVATE_TAG', 'ENTITY_PRIVATE_ATTRIBUTE', 'ENTITY_PRIVATE_INSTANCE_GM', 'ENTITY_PRIVATE_DEFINITION_GM']) assert.ok(html.includes(sentinel));
    assert.equal(page.window.document.querySelector('article')!.className, 'room-guide');
  } finally { page.window.close(); }
});
test('Player projection contains only non-empty explicitly public descriptions, with no Entity metadata before rendering', () => {
  const value = source(), options = { ...defaultScenarioGuideOptions('player'), includeMap: false };
  const document = buildScenarioPublishDocument(value, defaultPublishProfile('player'), options);
  const data = JSON.stringify(document);
  assert.doesNotMatch(data, /ENTITY_PRIVATE|912345|sourceContentId|contentSnapshot|quantity|customName|"kind"|"attributes"|"visibility"/);
  assert.deepEqual(document.scenario.rooms[0].entityDescriptions, ['祭壇の横に**銀の聖杯**が置かれている。']);
  assert.equal(document.scenario.rooms[0].entities, undefined); assert.equal(document.scenario.rooms[1].entityDescriptions, undefined);
  const html = createPublicationSession(value).guide(defaultPublishProfile('player'), options).html;
  assert.match(html, /銀の聖杯/); assert.doesNotMatch(html, /ENTITY_PRIVATE|912345|Monster|Treasure|Trap|Object|NPC|Event|data-entity|<!--/);
  value.entities.forEach(e => { e.visibility = 'gm-only'; });
  const empty = buildScenarioPublishDocument(value, defaultPublishProfile('player'), options);
  assert.ok(empty.scenario.rooms.every(r => r.entityDescriptions === undefined && r.entities === undefined));
});
test('description and GM-note options apply consistently to Entity and definition prose without exposing fallback names', () => {
  const value = source(), gm = createPublicationSession(value).guide(defaultPublishProfile('gm'), { ...defaultScenarioGuideOptions('gm'), includeMap: false, includeGmNotes: false, includeRoomDescriptions: false }).html;
  assert.doesNotMatch(gm, /ENTITY_PRIVATE_DEFINITION_GM|ENTITY_PRIVATE_INSTANCE_GM|銀の聖杯|素材の公開説明/);
  assert.match(gm, /ENTITY_PRIVATE_CUSTOM/);
  const player = createPublicationSession(value).guide(defaultPublishProfile('player'), { ...defaultScenarioGuideOptions('player'), includeMap: false, includeRoomDescriptions: false }).html;
  assert.doesNotMatch(player, /銀の聖杯|ENTITY_PRIVATE/);
});
test('all Entity Markdown is sanitized and names, tags and scalar attributes are escaped, never executed', () => {
  const value = source(), entity = value.entities[1], attack = '<script>alert(1)</script><img src=x onerror=alert(1)><iframe src=x></iframe>[危険](javascript:alert(1))';
  entity.customName = '<img src=x onerror=alert(1)>';
  entity.publicDescription = '公開の説明 ' + attack; entity.gmNotes = attack;
  entity.contentSnapshot.description = attack; entity.contentSnapshot.gmNotes = attack;
  entity.contentSnapshot.tags = ['<img src=x>']; entity.contentSnapshot.attributes = { '<img src=x>': '<script>escaped</script>' };
  for (const audience of ['gm', 'player'] as const) {
    const html = createPublicationSession(value).guide(defaultPublishProfile(audience), { ...defaultScenarioGuideOptions(audience), includeMap: false }).html;
    const page = new JSDOM(html);
    assert.equal(page.window.document.querySelector('script,img,iframe,[onerror],a[href^="javascript:"]'), null);
    if (audience === 'gm') assert.match(html, /&lt;script&gt;escaped&lt;\/script&gt;/);
    page.window.close();
  }
});
test('Player renderer defensively excludes GM entity groups even if a caller supplies a mixed projection', () => {
  const projected = buildScenarioPublishDocument(source(), defaultPublishProfile('gm'), { ...defaultScenarioGuideOptions('gm'), includeMap: false });
  const html = renderScenarioHtml({ ...projected.scenario, audience: 'player', includeTableOfContents: true });
  assert.doesNotMatch(html, /ENTITY_PRIVATE|912345/);
});
test('invalid snapshots, references, quantities and aggregate guide text reject publication instead of partial output', () => {
  for (const patch of [{ quantity: 0 }, { roomId: 'missing' }, { contentSnapshot: {} }]) {
    const value = source(); Object.assign(value.entities[0], patch);
    for (const audience of ['gm', 'player'] as const) assert.throws(() => createPublicationSession(value).guide(defaultPublishProfile(audience), { ...defaultScenarioGuideOptions(audience), includeMap: false }));
  }
  const value = source(); value.entities.forEach(e => { e.contentSnapshot.description = 'x'.repeat(100000); e.contentSnapshot.gmNotes = 'x'.repeat(100000); });
  assert.throws(() => createPublicationSession(value).guide(defaultPublishProfile('gm'), { ...defaultScenarioGuideOptions('gm'), includeMap: false }), /全体のテキスト/);
});
test('fixed publication snapshots retain Entity definitions and local text despite later source edits', () => {
  const value = source(), session = createPublicationSession(value);
  value.entities[0].quantity = 1; value.entities[0].contentSnapshot.attributes.hp = 12; value.entities[0].customName = '後からの変更';
  const html = session.guide(defaultPublishProfile('gm'), { ...defaultScenarioGuideOptions('gm'), includeMap: false }).html;
  assert.match(html, /912345/); assert.doesNotMatch(html, /後からの変更/); assert.match(html, /<td>hp<\/td><td>7<\/td>/);
});
test('maps, print maps, piece sheets and CSV inputs are unaffected by Entity presence', () => {
  const value = source(), bare = { ...value, entities: [] }, one = createPublicationSession(value), two = createPublicationSession(bare);
  for (const audience of ['gm', 'player'] as const) {
    const profile = defaultPublishProfile(audience), pieces = defaultPieceSheetSelection(), print = defaultPrintProfile();
    assert.equal(one.map(profile).svg, two.map(profile).svg);
    assert.equal(one.mapPrint(profile, { ...print, target: 'reference-map' }).html, two.mapPrint(profile, { ...print, target: 'reference-map' }).html);
    assert.equal(one.pieceSheet(audience, pieces, print).html(), two.pieceSheet(audience, pieces, print).html());
    assert.deepEqual(one.inventory(audience, pieces), two.inventory(audience, pieces));
  }
});
for (const kind of ['player', 'gm', 'complete'] as const) test(`${kind} ZIP and scenario print reuse Entity projection; Complete restores without a content library`, async () => {
  const value = source(), pngInputs: string[] = [];
  const builder = createPackageBuilder({ png: async svg => { pngInputs.push(svg); return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' }); } });
  const profile = defaultPackageProfile(kind);
  if (kind === 'player') profile.artifacts.push('scenario-print');
  const settings = { publish: defaultPublishProfile(kind === 'player' ? 'player' : 'gm'),
    guides: { player: defaultScenarioGuideOptions('player'), gm: defaultScenarioGuideOptions('gm') }, print: defaultPrintProfile(), pieces: defaultPieceSheetSelection() };
  const result = await builder.build(value, profile, settings), files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  const texts = Object.entries(files).filter(([name]) => !name.endsWith('.png')).map(([name, bytes]) => ({ name, text: new TextDecoder().decode(bytes) }));
  assert.ok(texts.some(f => f.name.includes('guide'))); assert.ok(pngInputs.every(svg => !svg.includes('ENTITY_PRIVATE')));
  assert.ok(texts.some(f => f.name.includes('print/scenario-guide.html') && f.text.includes(kind === 'player' ? '銀の聖杯' : 'ENTITY_PRIVATE_INSTANCE_GM')));
  if (kind === 'player') {
    assert.ok(texts.every(f => !/ENTITY_PRIVATE|912345|contentSnapshot|sourceContentId/.test(f.text)));
    assert.ok(texts.some(f => f.text.includes('銀の聖杯'))); assert.ok(!files['project/dungeon.json']);
  } else assert.ok(texts.some(f => f.text.includes('ENTITY_PRIVATE_INSTANCE_GM')));
  if (kind === 'complete') {
    const restored = parseDungeonJson(new TextDecoder().decode(files['project/dungeon.json'])).dungeon;
    assert.deepEqual(restored.entities, value.entities); assert.equal(await db.contentDefinitions.count(), 0);
    await dungeonRepository.save(restored); assert.deepEqual((await dungeonRepository.load(restored.id))!.entities, value.entities);
    assert.ok(Object.keys(files).every(name => !name.includes('content-library')));
  }
});
