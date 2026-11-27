import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyContentSelection, emptyPieceSelection, normalizeContentSelection, normalizePieceSelection, resolvePieceSelection, resolveContentSelection } from '../src/model/themeSelection';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { CONTENT_KINDS } from '../src/model/content';
import { newTheme, normalizeTheme, duplicateTheme, sameTheme, normalizeThemeAssignment, createThemeAssignment } from '../src/model/dungeonTheme';
import { buildThemeExport, parseThemeJson, themeFilename } from '../src/themes/themeJson';
import { fromThemeForm, toThemeForm } from '../src/themes/themeForm';
import { searchThemes } from '../src/themes/themeSearch';
import { formatStringList, parseStringList } from '../src/utils/stringList';
import { themeFixture } from './fixtures/themeFixture';
import { contentFixture } from './fixtures/entityFixture';
const pieces = [['c', ['fantasy','castle']], ['a', ['fantasy','地下']], ['b', ['science-fiction']], ['d', ['fantasy','地下','outdoor']]].map(([id,tags]) => ({ ...DEFAULT_PIECES[0], id: id as string, tags: tags as string[] }));
const ids = (p: ReturnType<typeof emptyPieceSelection>) => resolvePieceSelection(p, pieces).candidates.map(p => p.id);
test('new themes default to seven independent none policies without timestamps or implicit genre/category conditions', () => {
  const t = newTheme(); assert.equal(t.pieceSelection.mode, 'none'); assert.ok(!Object.hasOwn(t, 'createdAt'));
  for (const k of CONTENT_KINDS) assert.equal(t.contentSelection[k].mode, 'none');
  t.contentSelection.monster.tags.allOf.push('地下'); assert.deepEqual(t.contentSelection.treasure.tags.allOf, []);
  assert.deepEqual(ids({ ...emptyPieceSelection(), mode: 'all' }), ['a','b','c','d']);
});
test('filtered without positive tags or IDs stays empty, including an exclusion-only condition', () => {
  const p = { ...emptyPieceSelection(), mode: 'filtered' as const }; assert.deepEqual(ids(p), []);
  p.tags.noneOf = ['outdoor']; assert.deepEqual(ids(p), []); assert.equal(resolvePieceSelection(p, pieces).warnings[0].code, 'empty-candidates');
});
test('filtered unions explicit IDs with allOf AND anyOf matches, then exclusions always win', () => {
  const p = { ...emptyPieceSelection(), mode: 'filtered' as const, includePieceIds: ['b','c'], excludePieceIds: ['c'], tags: { allOf: ['fantasy'], anyOf: ['地下'], noneOf: ['outdoor'] } };
  assert.deepEqual(ids(p), ['a','b']); const warnings = resolvePieceSelection(p, pieces).warnings;
  assert.ok(warnings.some(w => w.code === 'include-exclude-conflict')); assert.ok(warnings.some(w => w.code === 'excluded-id' && w.id === 'c'));
  assert.ok(warnings.some(w => w.code === 'excluded-tag' && w.id === 'd'));
});
test('all and explicit ignore positive tags; none ignores everything; all modes honor applicable exclusions', () => {
  const p = { ...emptyPieceSelection(), includePieceIds: ['b','a'], excludePieceIds: ['a'], tags: { allOf: ['unmatched'], anyOf: ['no'], noneOf: ['science-fiction'] } };
  assert.deepEqual(ids({ ...p, mode: 'all' }), ['c','d']); assert.deepEqual(ids({ ...p, mode: 'explicit' }), []);
  assert.deepEqual(resolvePieceSelection({ ...p, mode: 'none' }, pieces), { candidates: [], warnings: [] });
});
test('tags trim and deduplicate but keep case and Japanese exact matching; IDs remain opaque', () => {
  const p = normalizePieceSelection({ ...emptyPieceSelection(), mode: 'filtered', tags: { allOf: [' 地下 ', '地下'], anyOf: [], noneOf: [] } });
  assert.deepEqual(p.tags.allOf, ['地下']); assert.deepEqual(ids(p), ['a','d']);
  p.tags.allOf = ['Fantasy']; assert.deepEqual(ids(p), []);
  const opaque = { ...pieces[0], id: ' id,一 ' }; p.mode = 'explicit'; p.includePieceIds = [opaque.id,opaque.id];
  assert.deepEqual(resolvePieceSelection(p, [opaque]).candidates.map(v => v.id), [opaque.id]);
});
test('missing references, kind mismatches and tag contradictions are diagnostics and never replacements', () => {
  const content = CONTENT_KINDS.map(k => contentFixture(k)), policy = emptyContentSelection();
  policy.monster = { mode: 'filtered', includeContentIds: ['missing',content[1].id], excludeContentIds: [], tags: { allOf: ['x'], anyOf: ['y'], noneOf: ['x','y'] } };
  const result = resolveContentSelection(policy,content); assert.deepEqual(result.candidates.monster, []);
  for (const code of ['missing-id','kind-mismatch','tag-conflict','empty-candidates']) assert.ok(result.warnings.some(w => w.kind === 'monster' && w.code === code));
  assert.deepEqual(result.candidates.treasure, []); normalizeTheme({ ...themeFixture(), contentSelection: policy });
});
test('all six content policies select only their own kinds and resolve independently', () => {
  const policy = emptyContentSelection(), content = CONTENT_KINDS.map(k => contentFixture(k));
  for (const kind of CONTENT_KINDS) policy[kind].mode = 'all';
  const result = resolveContentSelection(policy, content);
  for (const kind of CONTENT_KINDS) assert.deepEqual(result.candidates[kind], [contentFixture(kind)]);
  policy.event.mode = 'none'; assert.deepEqual(resolveContentSelection(policy, content).candidates.event, []);
});
test('resolver is pure, deduplicates IDs, returns stable ID order and warnings independently of library order', () => {
  const p = { ...emptyPieceSelection(), mode: 'all' as const, excludePieceIds: ['d','missing'] }, before = structuredClone({ p,pieces });
  const first = resolvePieceSelection(p, [...pieces,pieces[0]]), second = resolvePieceSelection(p, [...pieces].reverse());
  assert.deepEqual(first, second); assert.deepEqual({ p,pieces }, before); assert.deepEqual(first.candidates.map(v => v.id), ['a','b','c']);
});
test('standard and manual corridor pieces can be candidates; resolver never generates CorridorCells', () => {
  const result = resolvePieceSelection({ ...emptyPieceSelection(), mode: 'all' }, DEFAULT_PIECES);
  assert.equal(result.candidates.length, DEFAULT_PIECES.length); assert.ok(result.candidates.some(p => p.shape === 'corridor'));
});
for (const [field,value] of [['mode','random'],['includePieceIds',['']],['excludePieceIds',Array(101).fill('a')],['tags',{allOf:[],anyOf:[],noneOf:['x'.repeat(65)]}]] as const) test(`invalid policy ${field} rejects instead of truncating`, () => {
  assert.throws(() => normalizePieceSelection({ ...emptyPieceSelection(), [field]:value }));
});
test('content policy requires exactly the existing six kinds', () => {
  assert.throws(() => normalizeContentSelection({ ...emptyContentSelection(), faction: {} }));
  const { event: _unused,...missing } = emptyContentSelection(); assert.throws(() => normalizeContentSelection(missing));
});
test('theme validation rejects malformed data, invalid dates/order and exceeded limits', () => {
  for (const patch of [{name:' '},{genre:null},{category:'x'.repeat(101)},{summary:'x'.repeat(1001)},{description:'x'.repeat(100001)},{tags:Array(51).fill('x')},{createdAt:'2026-02-30T00:00:00.000Z'},{updatedAt:'2020-01-01T00:00:00.000Z'}]) assert.throws(() => normalizeTheme({ ...themeFixture(), ...patch }));
  assert.throws(() => normalizeTheme({ ...themeFixture(), description:'日'.repeat(100000), gmNotes:'日'.repeat(100000) }), /512 KiB/);
});
test('duplication and Assignment deeply copy policies and metadata; unset normalizes to absent; source IDs must agree', () => {
  const original = themeFixture(), duplicate = duplicateTheme(original); assert.notEqual(duplicate.id, original.id); assert.ok(!('createdAt' in duplicate));
  duplicate.contentSelection.monster.includeContentIds.push('copy'); assert.deepEqual(original.contentSelection.monster.includeContentIds, []);
  const assignment = createThemeAssignment(original); assignment.themeSnapshot.tags.push('assignment'); assert.equal(original.tags.length,2);
  assert.equal(normalizeThemeAssignment(null),undefined); assert.equal(normalizeThemeAssignment(undefined),undefined);
  assert.throws(() => normalizeThemeAssignment({...assignment,sourceThemeId:'other'}));
});
test('theme identity ignores timestamps and set order but includes each policy and all GM prose', () => {
  const a = themeFixture(), b = { ...structuredClone(a), updatedAt:'2026-12-01T00:00:00.000Z' }; b.tags.reverse();
  assert.equal(sameTheme(a,b),true); b.gmNotes+='change'; assert.equal(sameTheme(a,b),false);
  b.gmNotes=a.gmNotes; b.contentSelection.event.mode='all'; assert.equal(sameTheme(a,b),false);
});
test('form CSV round trips opaque IDs with commas, quotes and whitespace while tags normalize', () => {
  const t=themeFixture(); t.pieceSelection.includePieceIds=[' a,日 ','"quote"','normal'];
  t.contentSelection.npc.includeContentIds=[' lead','trail ']; assert.deepEqual(fromThemeForm(toThemeForm(t)), (({createdAt:_c,updatedAt:_u,...draft})=>draft)(t));
  const values=['a,b','"one"',' leading ','日']; assert.deepEqual(parseStringList(formatStringList(values)),values);
});
test('search covers Japanese/English metadata and exact genre/category filters without changing resolver policies', () => {
  const a=themeFixture(), b={...themeFixture('second'),genre:'fantasy',category:'cave',summary:'English CAVE'};
  assert.deepEqual(searchThemes([a,b],'CAVE'),[b]); assert.deepEqual(searchThemes([a,b],'古城','dark-fantasy','castle'),[a]);
  assert.deepEqual(searchThemes([a,b],'','Fantasy'),[]); assert.deepEqual(searchThemes([a,b],'地下','fantasy','cave'),[b]);
});
test('single/library JSON round trips policies and unresolved IDs without bundling materials; filenames are safe', () => {
  const t=themeFixture();t.pieceSelection.includePieceIds=['unresolved'];
  for(const single of [true,false]) {const out=buildThemeExport([t],single);assert.deepEqual(parseThemeJson(JSON.stringify(out)),[t]);assert.ok(!('pieces' in out)&&!('contents' in out));}
  assert.ok(!/[\\/]/.test(themeFilename('../古城/テーマ')));assert.ok(themeFilename('古城').endsWith('.theme.json'));
});
test('theme import rejects wrong versions/types, duplicate keys/IDs, invalid themes and batch/file limits', () => {
  const t=themeFixture(), data=buildThemeExport([t]);
  for(const raw of [{...data,schemaVersion:'9'}, {...data,type:'content-library'}, {...data,themes:[t,t]}, {...data,themes:[{...t,name:''}]}, {...data,themes:Array(501).fill(t)}]) assert.throws(()=>parseThemeJson(JSON.stringify(raw)));
  assert.throws(()=>parseThemeJson(JSON.stringify(data).replace('"mode":"none"','"mode":"none","mode":"all"')),/重複/);
  assert.throws(()=>parseThemeJson(' '.repeat(10*1024*1024+1)),/10 MiB/);assert.throws(()=>parseThemeJson('{'),/構文/);
});
