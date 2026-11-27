import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { unzipSync } from 'fflate';
import { createThemeAssignment } from '../src/model/dungeonTheme';
import { privateTheme } from './fixtures/themeFixture';
import { entityDungeon, contentFixture } from './fixtures/entityFixture';
import { createEntityInstance } from '../src/model/entity';
import { defaultPublishProfile } from '../src/publishing/publishProfile';
import { defaultScenarioGuideOptions } from '../src/publishing/scenario/scenarioGuide';
import { defaultPrintProfile } from '../src/publishing/print/printProfile';
import { defaultPieceSheetSelection } from '../src/publishing/pieceSheet/inventory';
import { defaultPackageProfile } from '../src/publishing/package/packagePlan';
import { buildPublishDocument, buildScenarioPublishDocument } from '../src/publishing/publishDocumentBuilder';
import { parseDungeonJson } from '../src/utils/exportImport';
import { db } from '../src/db/db';
const dom=new JSDOM('');Object.assign(globalThis,{window:dom.window});
const {createPublicationSession}=await import('../src/publishing/publicationSession');
const {createPackageBuilder}=await import('../src/publishing/package/buildPackage');
after(async()=>{await db.delete();dom.window.close();});
function source(){const d=entityDungeon();d.entities=[createEntityInstance('room-0',contentFixture(),d.rooms,4)];return {...d,theme:createThemeAssignment(privateTheme())};}
const settings={publish:defaultPublishProfile('gm'),guides:{gm:defaultScenarioGuideOptions('gm'),player:defaultScenarioGuideOptions('player')},print:defaultPrintProfile(),pieces:defaultPieceSheetSelection()};
test('GM and Player publication projections contain no Theme metadata, descriptions, policies or source IDs',()=>{
  for(const audience of ['gm','player'] as const){const d=source();for(const projected of [buildPublishDocument(d,audience),buildScenarioPublishDocument(d,defaultPublishProfile(audience),defaultScenarioGuideOptions(audience))])assert.doesNotMatch(JSON.stringify(projected),/THEME_PRIVATE|themeSnapshot|sourceThemeId|pieceSelection|contentSelection/);}
});
test('maps, guides, map prints, guide prints, piece sheets and inventory are byte-identical with or without a theme',()=>{
  const d=source(),{theme:_removed,...bare}=d,one=createPublicationSession(d),two=createPublicationSession(bare);
  for(const audience of ['gm','player'] as const){const p=defaultPublishProfile(audience),g=defaultScenarioGuideOptions(audience),print=defaultPrintProfile(),pieces=defaultPieceSheetSelection();
    assert.equal(one.map(p).svg,two.map(p).svg);assert.equal(one.guide(p,g).html,two.guide(p,g).html);assert.equal(one.mapPrint(p,{...print,target:'reference-map'}).html,two.mapPrint(p,{...print,target:'reference-map'}).html);
    assert.equal(one.guidePrint(p,g,{...print,target:'scenario-guide'}),two.guidePrint(p,g,{...print,target:'scenario-guide'}));assert.equal(one.pieceSheet(audience,pieces,print).html(),two.pieceSheet(audience,pieces,print).html());assert.deepEqual(one.inventory(audience,pieces),two.inventory(audience,pieces));
  }
});
for(const kind of ['player','gm','complete'] as const)test(`${kind} ZIP keeps Theme out of published artifacts; only Complete project JSON stores the snapshot`,async()=>{
  const pngInputs:string[]=[],builder=createPackageBuilder({png:async svg=>{pngInputs.push(svg);return new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});}});
  const d=source(),profile=defaultPackageProfile(kind);if(!profile.artifacts.includes('scenario-print'))profile.artifacts.push('scenario-print');const result=await builder.build(d,profile,settings),files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  for(const [path,bytes] of Object.entries(files)){if(path.endsWith('.png')||path==='project/dungeon.json')continue;assert.doesNotMatch(new TextDecoder().decode(bytes),/THEME_PRIVATE|themeSnapshot|sourceThemeId|pieceSelection|contentSelection/,path);}
  assert.ok(pngInputs.every(s=>!s.includes('THEME_PRIVATE')));assert.ok(Object.keys(files).every(p=>!p.includes('theme-library')));
  if(kind==='complete'){const restored=parseDungeonJson(new TextDecoder().decode(files['project/dungeon.json'])).dungeon;assert.deepEqual(restored.theme,d.theme);assert.equal(await db.dungeonThemes.count(),0);}else assert.equal(files['project/dungeon.json'],undefined);
});
