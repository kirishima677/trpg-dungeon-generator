import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newRoomTheme,normalizeRoomTheme,normalizeRoomConstraints,duplicateRoomTheme,sameRoomTheme,createRoomThemeAssignment,normalizeRoomThemeAssignment } from '../src/model/roomTheme';
import { newTheme,normalizeTheme,createThemeAssignment } from '../src/model/dungeonTheme';
import { emptyRoomThemeSelection,resolveRoomThemeSelection } from '../src/model/themeSelection';
import { evaluateRoomPiece,resolveRoomTheme,diagnosePlacedRoom } from '../src/model/roomThemeResolver';
import { buildRoomThemeExport,parseRoomThemeJson } from '../src/themes/roomThemeJson';
import { buildThemeExport,parseThemeJson } from '../src/themes/themeJson';
import { fromRoomThemeForm,toRoomThemeForm } from '../src/themes/roomThemeForm';
import { searchThemes } from '../src/themes/themeSearch';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import type { Piece } from '../src/model/types';
import { CONTENT_KINDS } from '../src/model/content';
import { contentFixture,entityDungeon } from './fixtures/entityFixture';
import { themeFixture } from './fixtures/themeFixture';
import { requiredFixture,roomThemeFixture } from './fixtures/roomThemeFixture';
const contents=CONTENT_KINDS.map(k=>contentFixture(k));
const allDungeon=()=>{const d=themeFixture();d.pieceSelection.mode='all';d.roomThemeSelection.mode='all';for(const k of CONTENT_KINDS)d.contentSelection[k].mode='all';return d;};
const resolve=(roomTheme:ReturnType<typeof roomThemeFixture>|null=roomThemeFixture(),dungeonTheme:ReturnType<typeof allDungeon>|null=null,pieces=DEFAULT_PIECES)=>resolveRoomTheme({roomTheme,dungeonTheme,pieces,contents});
test('new Room Theme defaults do not include Dungeon-only policy, auto-save data, constraints or required entries',()=>{
  const t=newRoomTheme();assert.equal(t.name,'');assert.equal(t.purpose,'');assert.equal(t.pieceSelection.mode,'none');assert.deepEqual(t.pieceConstraints,{});assert.deepEqual(t.requiredContents,[]);assert.ok(!('roomThemeSelection'in t)&&!('createdAt'in t));for(const k of CONTENT_KINDS)assert.equal(t.contentSelection[k].mode,'none');
});
test('legacy Dungeon Theme JSON and applied snapshots normalize missing Room policy to all, while new themes use none',()=>{
  const {roomThemeSelection:_legacy,...legacy}=themeFixture();const parsed=normalizeTheme(legacy);assert.equal(parsed.roomThemeSelection.mode,'all');assert.equal(newTheme().roomThemeSelection.mode,'none');
  assert.deepEqual(parsed.pieceSelection,legacy.pieceSelection);assert.deepEqual(parsed.contentSelection,legacy.contentSelection);assert.equal(createThemeAssignment(parsed).themeSnapshot.roomThemeSelection.mode,'all');
  const json={schemaVersion:'1.0.0',type:'dungeon-theme',theme:legacy};assert.deepEqual(parseThemeJson(JSON.stringify(json)),[parsed]);assert.deepEqual(parseThemeJson(JSON.stringify(buildThemeExport([parsed],true))),[parsed]);
});
for(const patch of [{minCells:0},{minConnectors:-1},{minWidth:1.5},{maxHeight:Infinity},{minCells:20,maxCells:4},{minConnectors:3,maxConnectors:2},{minWidth:5,maxWidth:3},{minHeight:5,maxHeight:3},{maxWidth:1000001},{unknown:2}])test(`invalid structural constraints reject ${JSON.stringify(patch)}`,()=>{assert.throws(()=>normalizeRoomConstraints(patch));});
test('unset constraints and connector zero differ and survive form/JSON round trips without clipping',()=>{
  const t=roomThemeFixture();t.pieceConstraints={maxConnectors:0};const form=toRoomThemeForm(t);assert.equal(form.constraints.maxConnectors,'0');assert.equal(form.constraints.minCells,'');assert.deepEqual(fromRoomThemeForm(form).pieceConstraints,{maxConnectors:0});form.constraints.minCells='abc';assert.throws(()=>fromRoomThemeForm(form),/整数/);
});
test('non-rectangular area uses occupied cells, connector count uses valid definition connectors and bounds ignore position',()=>{
  const piece:Piece={id:'triangle',name:'三角',shape:'custom',cells:[{x:5,y:9},{x:6,y:9},{x:7,y:9},{x:5,y:10},{x:6,y:10},{x:5,y:11}],connectors:[{id:'good',position:{x:5,y:9},direction:'north',kind:'open',width:1},{id:'invalid',position:{x:6,y:9},direction:'west',kind:'open',width:1}]};
  const r=evaluateRoomPiece(piece,{minCells:6,maxCells:6,minWidth:3,maxWidth:3,minHeight:3,maxHeight:3,maxConnectors:1},0);assert.equal(r.matches,true);assert.deepEqual(r.metrics,{Cells:6,Width:3,Height:3,Connectors:1});assert.equal(evaluateRoomPiece(piece,{minCells:9},0).matches,false);
});
test('candidate Piece accepts any supported rotation, but placed-room diagnostics evaluate its current rotation only',()=>{
  const r=roomThemeFixture();r.pieceConstraints={minWidth:6,maxHeight:3};const pieces=[DEFAULT_PIECES[1]],result=resolve(r,null,pieces);assert.deepEqual(result.pieceCandidates[0].rotations,[0,180]);
  const room={...entityDungeon().rooms[0],piece:pieces[0],pieceId:pieces[0].id,rotation:90 as const,roomTheme:createRoomThemeAssignment(r)};
  assert.ok(diagnosePlacedRoom(room).some(w=>w.code==='placed-constraints'));room.rotation=0 as 90;assert.equal(diagnosePlacedRoom(room).length,0);
});
test('structural conditions can remove all candidates without invalidating the Theme definition',()=>{
  const t=roomThemeFixture();t.pieceConstraints={minCells:1000};assert.equal(resolve(t).pieceCandidates.length,0);normalizeRoomTheme(t);assert.ok(resolve(t).warnings.some(w=>w.code==='piece-constraints'));assert.ok(resolve(t).warnings.some(w=>w.code==='empty-pieces'));
});
test('candidate composition covers neither theme, each theme alone, intersection and none without fallback',()=>{
  const r=roomThemeFixture(),d=allDungeon();r.pieceConstraints={};r.pieceSelection.mode='explicit';r.pieceSelection.includePieceIds=[DEFAULT_PIECES[0].id,DEFAULT_PIECES[1].id];d.pieceSelection.mode='explicit';d.pieceSelection.includePieceIds=[DEFAULT_PIECES[1].id,DEFAULT_PIECES[2].id];
  assert.equal(resolve(null,null).pieceCandidates.length,5);assert.equal(resolve(r).pieceCandidates.length,2);assert.equal(resolve(null,d).pieceCandidates.length,2);assert.deepEqual(resolve(r,d).pieceCandidates.map(v=>v.piece.id),[DEFAULT_PIECES[1].id]);
  d.pieceSelection.mode='none';d.contentSelection.monster.mode='none';assert.deepEqual(resolve(r,d).pieceCandidates,[]);assert.deepEqual(resolve(r,d).contentCandidates.monster,[]);
});
test('all six content kinds intersect by ID, honor exclusions and never use other-kind references',()=>{
  const r=roomThemeFixture(),d=allDungeon();for(const k of CONTENT_KINDS){r.contentSelection[k].mode='explicit';r.contentSelection[k].includeContentIds=[contentFixture(k).id];}r.contentSelection.monster.includeContentIds.push(contentFixture('treasure').id);d.contentSelection.object.excludeContentIds=[contentFixture('object').id];
  const result=resolve(r,d);for(const k of CONTENT_KINDS)assert.equal(result.contentCandidates[k].length,k==='object'?0:1);assert.ok(result.warnings.some(w=>w.code==='kind-mismatch'&&w.kind==='monster'));assert.equal(result.requiredContents[0].conflict,true);
});
test('Required entries resolve separately from optional candidates and diagnose conflicts, missing references and changed kinds',()=>{
  const r=roomThemeFixture();r.requiredContents=[requiredFixture('one'),requiredFixture('missing'),requiredFixture('wrong')];r.requiredContents[1].contentId='absent';r.requiredContents[2].expectedKind='monster';r.contentSelection.object.mode='none';
  const result=resolve(r);assert.deepEqual(result.requiredContents.map(r=>r.status),['resolved','missing','kind-mismatch']);assert.equal(result.requiredContents[0].conflict,true);assert.ok(result.warnings.some(w=>w.code==='required-conflict'));normalizeRoomTheme(r);
});
test('Dungeon Room Theme selection reuses modes, exact tags, explicit union, exclusion priority and stable ID order',()=>{
  const a=roomThemeFixture('a'),b={...roomThemeFixture('b'),tags:['SF']};const p={...emptyRoomThemeSelection('filtered'),includeRoomThemeIds:['b','missing'],excludeRoomThemeIds:['b'],tags:{allOf:[' 地下 '],anyOf:[],noneOf:[]}};
  const result=resolveRoomThemeSelection(p,[b,a,a]);assert.deepEqual(result.candidates,[a]);assert.ok(result.warnings.some(w=>w.code==='missing-id'));assert.deepEqual(resolveRoomThemeSelection({...emptyRoomThemeSelection('filtered'),tags:{allOf:[],anyOf:[],noneOf:['SF']}},[a,b]).candidates,[]);
  const d=allDungeon();d.roomThemeSelection.mode='none';assert.ok(resolve(a,d).warnings.some(w=>w.code==='room-theme-excluded'));assert.ok(resolve(a,d).pieceCandidates.length);
});
test('Room resolver is pure and stable under library order changes, and returns matching rotations without rotating inputs',()=>{
  const r=roomThemeFixture(),d=allDungeon(),before=structuredClone({r,d,pieces:DEFAULT_PIECES,contents}),one=resolve(r,d),two=resolveRoomTheme({roomTheme:r,dungeonTheme:d,pieces:[...DEFAULT_PIECES].reverse(),contents:[...contents].reverse()});assert.deepEqual(one,two);assert.deepEqual({r,d,pieces:DEFAULT_PIECES,contents},before);
});
test('required entries validate IDs, kind, quantity, visibility and limits while allowing duplicate Content IDs',()=>{
  const r=roomThemeFixture();r.requiredContents.push(requiredFixture('second'));normalizeRoomTheme(r);
  for(const patch of [{id:''},{quantity:0},{quantity:1.5},{quantity:1000001},{visibility:'hidden'},{expectedKind:'faction'},{contentId:''},{customName:'x'.repeat(201)},{publicDescription:'x'.repeat(20001)}])assert.throws(()=>normalizeRoomTheme({...r,requiredContents:[{...requiredFixture(),...patch}]}));
  assert.throws(()=>normalizeRoomTheme({...r,requiredContents:[requiredFixture(),requiredFixture()]}),/重複/);assert.throws(()=>normalizeRoomTheme({...r,requiredContents:Array.from({length:51},(_,n)=>requiredFixture(String(n)))}),/50/);
});
test('Room Theme structural validation enforces string/date/tag/size limits and does not contain material definitions',()=>{
  for(const patch of [{name:' '},{purpose:null},{purpose:'x'.repeat(1001)},{tags:Array(51).fill('x')},{createdAt:'bad'},{updatedAt:'2020-01-01T00:00:00.000Z'},{gmNotes:'x'.repeat(100001)}])assert.throws(()=>normalizeRoomTheme({...roomThemeFixture(),...patch}));
  assert.throws(()=>normalizeRoomTheme({...roomThemeFixture(),description:'日'.repeat(100000),gmNotes:'日'.repeat(100000)}),/512 KiB/);assert.ok(!JSON.stringify(roomThemeFixture()).includes('contentSnapshot'));
});
test('duplication creates independent Theme and entry IDs while Assignment deeply copies and preserves referenced material IDs',()=>{
  const original=roomThemeFixture(),copy=duplicateRoomTheme(original);assert.notEqual(copy.id,original.id);assert.notEqual(copy.requiredContents[0].id,original.requiredContents[0].id);assert.equal(copy.requiredContents[0].contentId,original.requiredContents[0].contentId);copy.requiredContents[0].quantity=9;copy.pieceSelection.includePieceIds.push('copy');assert.equal(original.requiredContents[0].quantity,4);assert.deepEqual(original.pieceSelection.includePieceIds,[]);
  const assigned=createRoomThemeAssignment(original);assigned.themeSnapshot.requiredContents[0].gmNotes='different';assert.notEqual(original.requiredContents[0].gmNotes,'different');assert.equal(normalizeRoomThemeAssignment(null),undefined);assert.throws(()=>normalizeRoomThemeAssignment({...assigned,sourceThemeId:'wrong'}));
});
test('Room Theme identity includes purpose/entry identity and fields while ignoring timestamps, tag order and constraint key order',()=>{
  const a=roomThemeFixture(),b=structuredClone(a);b.updatedAt='2026-12-01T00:00:00.000Z';b.tags.reverse();b.pieceConstraints={minConnectors:1,minCells:4};assert.equal(sameRoomTheme(a,b),true);b.purpose='変更';assert.equal(sameRoomTheme(a,b),false);b.purpose=a.purpose;b.requiredContents[0].id='another';assert.equal(sameRoomTheme(a,b),false);
});
test('Room JSON and editor forms round trip all fields, opaque IDs and unresolved references, with safe filenames and purpose search',()=>{
  const t=roomThemeFixture();t.requiredContents[0].contentId=' unknown,素材 ';for(const single of [true,false])assert.deepEqual(parseRoomThemeJson(JSON.stringify(buildRoomThemeExport([t],single))),[t]);const {createdAt:_c,updatedAt:_u,...draft}=t;assert.deepEqual(fromRoomThemeForm(toRoomThemeForm(t)),draft);assert.deepEqual(searchThemes([t],'礼拝'),[t]);assert.deepEqual(searchThemes([t],'礼拝','SF'),[]);
});
test('Room JSON rejects duplicate/escaped keys and IDs, versions, wrong domain, malformed definitions and file/batch limits',()=>{
  const t=roomThemeFixture(),raw=buildRoomThemeExport([t]);for(const v of [{...raw,type:'dungeon-theme-library'},{...raw,schemaVersion:'9'},{...raw,themes:[t,t]},{...raw,themes:[{...t,name:''}]},{...raw,themes:Array(501).fill(t)}])assert.throws(()=>parseRoomThemeJson(JSON.stringify(v)));
  assert.throws(()=>parseRoomThemeJson(JSON.stringify(raw).replace('"purpose":','"purpo\\u0073e":"x","purpose":')),/重複/);assert.throws(()=>parseRoomThemeJson(' '.repeat(10*1024*1024+1)),/10 MiB/);assert.throws(()=>parseRoomThemeJson('{'),/構文/);
});
