import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after,test } from 'node:test';
import { JSDOM } from 'jsdom';
import { unzipSync } from 'fflate';
import { privateRoomTheme } from './fixtures/roomThemeFixture';
import { createRoomThemeAssignment } from '../src/model/roomTheme';
import { contentFixture,entityDungeon } from './fixtures/entityFixture';
import { prepareRequiredPlacement } from '../src/model/roomThemePlacement';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { defaultScenarioGuideOptions } from '../src/publishing/scenario/scenarioGuide';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { defaultPieceSheetSelection } from '../src/publishing/pieceSheet/inventory';
import { defaultPackageProfile } from '../src/publishing/package/packagePlan';
import { buildPublishDocument,buildScenarioPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { parseDungeonJson } from '../src/utils/exportImport';
import { db } from '../src/db/db';
const dom=new JSDOM('');Object.assign(globalThis,{window:dom.window});
const {createPublicationSession}=await import('../src/publishing/publicationSession');
const {createPackageBuilder}=await import('../src/publishing/package/buildPackage');
after(async()=>{await db.delete();dom.window.close();});
function source(){const d=entityDungeon(),t=privateRoomTheme();t.requiredContents[0].visibility='public';d.rooms[0].roomTheme=createRoomThemeAssignment(t);d.entities=prepareRequiredPlacement(d,'room-0',[contentFixture('object')],DEFAULT_PIECES).added;return d;}
const settings={publish:defaultPublishProfile('gm'),guides:{gm:defaultScenarioGuideOptions('gm'),player:defaultScenarioGuideOptions('player')},print:defaultPrintProfile(),pieces:defaultPieceSheetSelection()};
test('both publication projections omit Room Theme and origin before render, while required Entities follow normal GM/Player publication',()=>{
  for(const audience of ['gm','player']as const){const d=source(),projected=buildScenarioPublishDocument(d,defaultPublishProfile(audience),defaultScenarioGuideOptions(audience));assert.doesNotMatch(JSON.stringify(projected),/ROOM_THEME_PRIVATE|roomTheme|sourceRoomThemeId|requiredEntryId|pieceConstraints|requiredContents|"origin"/);assert.doesNotMatch(JSON.stringify(buildPublishDocument(d,audience)),/ROOM_THEME_PRIVATE|roomTheme/);
    const html=createPublicationSession(d).guide(defaultPublishProfile(audience),defaultScenarioGuideOptions(audience)).html;assert.match(html,/銀の聖杯/);assert.doesNotMatch(html,/ROOM_THEME_PRIVATE|sourceRoomThemeId|requiredEntryId/);if(audience==='gm')assert.match(html,/REQUIRED_PRIVATE_NOTES/);else assert.doesNotMatch(html,/REQUIRED_PRIVATE_NOTES|ENTITY_PRIVATE|quantity/);
  }
});
test('Room assignments/origin leave map, guide, map print, guide print, piece sheets and inventory byte-identical',()=>{
  const d=source(),bare={...d,rooms:d.rooms.map(({roomTheme:_theme,...r})=>r),entities:d.entities.map(({origin:_origin,...e})=>e)},one=createPublicationSession(d),two=createPublicationSession(bare);
  for(const audience of ['gm','player']as const){const p=defaultPublishProfile(audience),g=defaultScenarioGuideOptions(audience),print=defaultPrintProfile(),pieces=defaultPieceSheetSelection();assert.equal(one.map(p).svg,two.map(p).svg);assert.equal(one.guide(p,g).html,two.guide(p,g).html);assert.equal(one.mapPrint(p,{...print,target:'reference-map'}).html,two.mapPrint(p,{...print,target:'reference-map'}).html);assert.equal(one.guidePrint(p,g,print),two.guidePrint(p,g,print));assert.equal(one.pieceSheet(audience,pieces,print).html(),two.pieceSheet(audience,pieces,print).html());assert.deepEqual(one.inventory(audience,pieces),two.inventory(audience,pieces));}
});
for(const kind of ['player','gm','complete']as const)test(`${kind} ZIP excludes Room Theme/origin from published artifacts; Complete restores assignment and Entity origin without libraries`,async()=>{
  const d=source(),inputs:string[]=[],builder=createPackageBuilder({png:async svg=>{inputs.push(svg);return new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});}}),profile=defaultPackageProfile(kind);if(!profile.artifacts.includes('scenario-print'))profile.artifacts.push('scenario-print');const result=await builder.build(d,profile,settings),files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  for(const [path,bytes]of Object.entries(files)){if(path==='project/dungeon.json'||path.endsWith('.png'))continue;assert.doesNotMatch(new TextDecoder().decode(bytes),/ROOM_THEME_PRIVATE|sourceRoomThemeId|requiredEntryId|roomThemeSnapshot|pieceConstraints|requiredContents/,path);}
  assert.ok(inputs.every(s=>!s.includes('ROOM_THEME_PRIVATE')));if(kind==='complete'){const restored=parseDungeonJson(new TextDecoder().decode(files['project/dungeon.json'])).dungeon;assert.deepEqual(restored.rooms[0].roomTheme,d.rooms[0].roomTheme);assert.deepEqual(restored.entities,d.entities);assert.equal(await db.roomThemes.count(),0);assert.equal(await db.contentDefinitions.count(),0);}else assert.equal(files['project/dungeon.json'],undefined);
});
