import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { publicationFixture, fixtureTimestamp } from './fixtures/publicationFixture';
import { publicationBaselineData } from './fixtures/publicationBaselineData';
import { buildPackagePlan } from '../src/publishing/package/packagePlan';
import { buildPublishMapGeometry } from '../src/publishing/publishMapGeometry';
import { defaultPieceSheetSelection } from '../src/publishing/pieceSheet/inventory';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { publicationIssue, canPreviewPieceSheet, needsAcknowledgement, PublicationIssueError } from '../src/publishing/publicationIssues';

const dom = new JSDOM(''); Object.assign(globalThis, { window: dom.window });
const { createPublicationSession } = await import('../src/publishing/publicationSession');
const { createArtifactGenerator, packagePublishProfile } = await import('../src/publishing/package/artifactGenerator');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/publication-baseline.json', import.meta.url), 'utf8')) as Record<string, string>;
after(() => dom.window.close());

test('15 artifacts remain byte-identical to abc7816 and project JSON changes only to Entity schema 1.3', async () => {
  const { source, settings, profile } = publicationFixture(), plan = buildPackagePlan(profile, source);
  const generator = createArtifactGenerator(source, settings, profile.title, true, undefined, fixtureTimestamp);
  const requests = plan.artifacts.filter(r => Object.hasOwn(baseline, r.path));
  assert.equal(requests.length, 16);
  for (const request of requests) {
    const artifact = await generator.generate(request);
    assert.equal(createHash('sha256').update(publicationBaselineData(request.path, artifact.data)).digest('hex'), baseline[request.path], request.path);
  }
});
test('session caches routing once per audience while paper, visual settings and quantities change', () => {
  const { source, settings } = publicationFixture(); let calls = 0;
  const session = createPublicationSession(source, document => { calls++; return buildPublishMapGeometry(document); });
  const p = settings.publish;
  session.map(p); session.map({ ...p, showGrid: false }); session.map({ ...p, pixelsPerCell: 128 });
  session.guide(p, settings.guides.gm); session.guide(p, { ...settings.guides.gm, includeGmNotes: false });
  session.mapPrint(p, { ...defaultPrintProfile('reference-map'), paperSize: 'A3' });
  session.inventory('gm', settings.pieces); session.inventory('gm', { ...settings.pieces, quantities: {} });
  assert.equal(calls, 1);
  session.map({ ...p, audience: 'player', showRoomNames: false }); assert.equal(calls, 2);
  session.geometry('gm'); session.geometry('player'); assert.equal(calls, 2);
});
test('session captures a fixed snapshot and cache size does not grow with visual variants', () => {
  const { source, settings } = publicationFixture(), session = createPublicationSession(source);
  const original = session.map(settings.publish);
  source.rooms[0].position.x = 100; source.rooms[0].information.name = 'CHANGED';
  assert.equal(session.map(settings.publish), original);
  session.map({ ...settings.publish, showGrid: false });
  const again = session.map(settings.publish); assert.notEqual(again, original); assert.equal(again.svg, original.svg);
  assert.notEqual(createPublicationSession(source).map(settings.publish).svg, original.svg);
});
test('prose settings reuse guide map and a guide without map does not require geometry', () => {
  const { source, settings } = publicationFixture(), session = createPublicationSession(source);
  const a = session.guide(settings.publish, settings.guides.gm), b = session.guide(settings.publish, { ...settings.guides.gm, includeGmNotes: false });
  assert.equal(a.map, b.map); assert.notEqual(a.html, b.html);
  const broken = createPublicationSession(source, () => { throw new Error('GEOMETRY_BROKEN'); });
  assert.doesNotThrow(() => broken.guide(settings.publish, { ...settings.guides.gm, includeMap: false }));
  assert.throws(() => broken.guide(settings.publish, settings.guides.gm), /GEOMETRY_BROKEN/);
});
test('individual opt-in room names and package player exclusions remain distinct policies', () => {
  const { source, settings } = publicationFixture(), session = createPublicationSession(source);
  const player = { ...settings.publish, audience: 'player' as const, showRoomNames: true };
  assert.match(session.map(player).svg, /PRIVATE_NAME/);
  assert.match(session.guide(player, settings.guides.player).html, /PRIVATE_NAME/);
  const packaged = packagePublishProfile(player, 'player');
  assert.doesNotMatch(session.map(packaged).svg, /PRIVATE_/);
  assert.doesNotMatch(session.guide(packaged, settings.guides.player).html, /PRIVATE_/);
  const selection = defaultPieceSheetSelection(); selection.options.source = 'library'; selection.library = [source.rooms[3].piece];
  assert.equal(session.inventory('player', selection).items[0].name, source.rooms[3].piece.name);
  assert.equal(session.inventory('player', selection, 'package').items[0].name, 'R-001');
});
test('issue codes, rather than translated text, control preview and acknowledgement', () => {
  const unplaced = publicationIssue('unplaced-pieces', 'An untranslated message');
  const overlap = publicationIssue('layout-overlap', '未配置の素材が1枚あります。');
  assert.equal(canPreviewPieceSheet([unplaced]), true); assert.equal(canPreviewPieceSheet([overlap]), false);
  assert.equal(canPreviewPieceSheet([unplaced, overlap]), false);
  assert.equal(needsAcknowledgement([publicationIssue('unsupported-connections', 'changed')]), true);
  assert.equal(needsAcknowledgement([publicationIssue('insufficient-quantity', '未解決の接続')]), false);
  const error = new PublicationIssueError([unplaced]); assert.equal(error.issues[0].code, 'unplaced-pieces'); assert.equal(error.message, unplaced.message);
});
test('unplaced preview remains available but full export is blocked; other invalid layouts are always blocked', () => {
  const { source, settings } = publicationFixture(), session = createPublicationSession(source);
  const p = defaultPrintProfile(); p.map.cellSizeMm = 100;
  const value = session.pieceSheet('player', settings.pieces, p);
  assert.ok(value.issues.some(i => i.code === 'unplaced-pieces'));
  assert.throws(() => value.html(), (e: unknown) => e instanceof PublicationIssueError && e.issues.some(i => i.code === 'unplaced-pieces'));
  assert.ok(value.layout.pages.length); assert.match(value.html(0), /未配置の素材があります/);
  value.layout.pages[0].pieces[0].art.width *= 0.5;
  assert.throws(() => value.html(0), (e: unknown) => e instanceof PublicationIssueError && e.issues.some(i => i.code === 'layout-dimensions'));
});
