import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {JSDOM} from 'jsdom';
import {unzipSync} from 'fflate';
import {factionDungeon} from './fixtures/factionFixture';
import {defaultPublishProfile} from '../src/publishing/publishProfile';
import {defaultScenarioGuideOptions} from '../src/publishing/scenario/scenarioGuide';
import {defaultPrintProfile,changePrintTarget} from '../src/publishing/print/printProfile';
import {defaultPieceSheetSelection} from '../src/publishing/pieceSheet/inventory';
import {defaultPackageProfile} from '../src/publishing/package/packagePlan';
import {parseDungeonJson} from '../src/utils/exportImport';
import {buildFactionOverlay} from '../src/factions/factionOverlay';
import {getWorldCells} from '../src/utils/geometry';
import {DEFAULT_PIECES} from '../src/model/pieceLibrary';
import {buildScenarioPublishDocument} from '../src/publishing/publishDocumentBuilder';
const dom=new JSDOM('');Object.assign(globalThis,{window:dom.window});
const {createPublicationSession}=await import('../src/publishing/publicationSession');
const {renderScenarioHtml}=await import('../src/publishing/scenario/scenarioHtmlRenderer');
const {createPackageBuilder}=await import('../src/publishing/package/buildPackage');
after(()=>dom.window.close());
const options=(audience:'gm'|'player')=>({...defaultScenarioGuideOptions(audience),includeMap:false});
function source(){const d=factionDungeon();d.factions[0].visibility='public';d.factions[0].publicName='地下の見張り団';d.factions[0].publicDescription='旅人を**見張る**一団。';d.factions[1].visibility='public';return d;}
test('GM guide publishes registered snapshots/local objectives, territory, symmetric relations, counts and member affiliation',()=>{
 const d=source(),html=createPublicationSession(d).guide(defaultPublishProfile('gm'),options('gm')).html;
 for(const sentinel of ['FACTION_PRIVATE_BACKGROUND','FACTION_PRIVATE_OBJECTIVES','FACTION_PRIVATE_BEHAVIOR','FACTION_PRIVATE_GM','FACTION_PRIVATE_CURRENT','FACTION_PRIVATE_SITUATION','FACTION_PRIVATE_USE','FACTION_PRIVATE_TERRITORY_GM','FACTION_PRIVATE_RELATION_GM','所属勢力','係争中','単独支配','敵対'])assert.ok(html.includes(sentinel),sentinel);
 assert.doesNotMatch(html,/FACTION_PRIVATE_INSTANCE_A|FACTION_PRIVATE_DEFINITION|FACTION_PRIVATE_RELATION"/);
 const noNotes=createPublicationSession(d).guide(defaultPublishProfile('gm'),{...options('gm'),includeGmNotes:false}).html;assert.doesNotMatch(noNotes,/FACTION_PRIVATE_GM|FACTION_PRIVATE_INSTANCE_GM|FACTION_PRIVATE_TERRITORY_GM|FACTION_PRIVATE_RELATION_GM/);
});
test('player projection permits explicit public fields only, with no fallback or empty placeholders; public Factions never reveal members',()=>{
 const d=source(),projected=buildScenarioPublishDocument(d,defaultPublishProfile('player'),options('player')),json=JSON.stringify(projected);
 assert.doesNotMatch(json,/FACTION_PRIVATE|ENTITY_PRIVATE|factionControl|mapColor|factionId|sourceFactionId|relations|territories/);assert.deepEqual(projected.scenario.factions,[{publicName:'地下の見張り団',publicDescription:'旅人を**見張る**一団。'}]);
 const html=createPublicationSession(d).guide(defaultPublishProfile('player'),options('player')).html;assert.match(html,/地下の見張り団/);assert.match(html,/<strong>見張る<\/strong>/);assert.doesNotMatch(html,/FACTION_PRIVATE|ENTITY_PRIVATE|所属勢力|単独支配|係争中|敵対/);
 d.factions[0].publicName='';d.factions[0].publicDescription='';const empty=createPublicationSession(d).guide(defaultPublishProfile('player'),options('player')).html;assert.doesNotMatch(empty,/guide-factions|<h2>勢力/);
});
test('player renderer rejects GM faction/control/entity fields even for a mixed projection',()=>{const d=source(),gm=buildScenarioPublishDocument(d,defaultPublishProfile('gm'),options('gm'));const html=renderScenarioHtml({...gm.scenario,audience:'player',includeTableOfContents:true});assert.doesNotMatch(html,/FACTION_PRIVATE|ENTITY_PRIVATE|所属勢力|単独支配|係争中/);});
test('overlay uses actual L-shaped occupied cells after rotation/negative coordinates/moves, no bbox padding',()=>{
 const d=source();d.rooms[0].piece=structuredClone(DEFAULT_PIECES.find(p=>p.shape==='l-shape')!);d.rooms[0].pieceId=d.rooms[0].piece.id;d.rooms[0].rotation=90;d.rooms[0].position={x:-12,y:-7};const overlay=buildFactionOverlay(d);assert.deepEqual(overlay.rooms[0].cells,getWorldCells(d.rooms[0]));assert.equal(overlay.rooms[0].colors.length,1);assert.equal(overlay.rooms[1].colors.length,3);assert.equal(overlay.legend.length,3);const old=overlay.rooms[0].cells[0].x;d.rooms[0].position.x+=5;assert.equal(buildFactionOverlay(d).rooms[0].cells[0].x,old+5);assert.doesNotMatch(JSON.stringify(overlay),/FACTION_PRIVATE_INSTANCE|sourceFactionId/);
});
test('GM map overlay is opt-in, retains routing/grid and allocates legend bounds; Player ignores a malicious true flag entirely',()=>{
 const d=source(),session=createPublicationSession(d),gm=defaultPublishProfile('gm'),normal=session.map(gm),scene=session.geometry('gm');assert.doesNotMatch(normal.svg,/FACTION_PRIVATE|係争/);const overlay=session.map({...gm,showFactions:true});assert.match(overlay.svg,/FACTION_PRIVATE_A/);assert.match(overlay.svg,/係争/);assert.ok(overlay.height>normal.height);assert.strictEqual(session.geometry('gm'),scene);assert.doesNotMatch(overlay.svg,/FACTION_PRIVATE_INSTANCE|sourceFactionId/);
 const player=defaultPublishProfile('player');assert.equal(session.map({...player,showFactions:true}).svg,session.map(player).svg);assert.doesNotMatch(session.map({...player,showFactions:true}).svg,/FACTION_PRIVATE|#BA6157|#557BB5|#59966D|係争|勢力/);
 const page=new JSDOM(overlay.svg,{contentType:'image/svg+xml'});assert.ok(page.window.document.querySelector('g[pointer-events="none"]'));assert.ok(page.window.document.querySelector('path[stroke]'));page.window.close();
});
test('ordinary maps, battle/reference prints, piece sheets and CSV inventory remain identical with Faction data',()=>{
 const d=source(),bare={...d,factions:[],factionRelations:[],roomFactionAssignments:[],entities:d.entities.map(e=>{const {factionId:_id,...rest}=e;return rest;})},a=createPublicationSession(d),b=createPublicationSession(bare);
 for(const audience of ['gm','player'] as const){const profile=defaultPublishProfile(audience),print=defaultPrintProfile(),pieces=defaultPieceSheetSelection();assert.equal(a.map(profile).svg,b.map(profile).svg);for(const target of ['battle-map','reference-map'] as const)assert.equal(a.mapPrint({...profile,showFactions:true},changePrintTarget(print,target)).html,b.mapPrint(profile,changePrintTarget(print,target)).html);assert.equal(a.pieceSheet(audience,pieces,print).html(),b.pieceSheet(audience,pieces,print).html());assert.deepEqual(a.inventory(audience,pieces),b.inventory(audience,pieces));}
});
test('all faction prose is sanitized, labels escaped and external paint/server resource colors rejected',()=>{
 const d=source(),attack='<script>alert(1)</script><img src=x onerror=alert(1)><iframe src=x></iframe>[危険](javascript:alert(1))';d.factions[0].publicName='<img src=x onerror=alert(1)>';d.factions[0].publicDescription=attack;d.factions[0].currentObjectives=attack;d.factions[0].factionSnapshot.description=attack;
 for(const audience of ['gm','player'] as const){const html=createPublicationSession(d).guide(defaultPublishProfile(audience),options(audience)).html,page=new JSDOM(html);assert.equal(page.window.document.querySelector('script,img,iframe,[onerror],a[href^="javascript:"]'),null);page.window.close();}
 d.factions[0].mapColor='url(https://evil/image.svg)';assert.throws(()=>buildFactionOverlay(d));assert.throws(()=>createPublicationSession(d).map({...defaultPublishProfile('gm'),showFactions:true}));
});
test('fixed publication snapshot does not observe later Faction edits',()=>{const d=source(),s=createPublicationSession(d);d.factions[0].publicName='later';d.factions[0].factionSnapshot.description='later';assert.match(s.guide(defaultPublishProfile('player'),options('player')).html,/地下の見張り団/);assert.match(s.guide(defaultPublishProfile('gm'),options('gm')).html,/FACTION_PRIVATE_BACKGROUND/);});
for(const kind of ['player','gm','complete'] as const)test(`${kind} ZIP applies Faction privacy to every file and PNG input; Complete restores full project`,async()=>{
 const d=source(),pngs:string[]=[];const builder=createPackageBuilder({png:async svg=>{pngs.push(svg);return new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});}}),profile=defaultPackageProfile(kind);if(!profile.artifacts.includes('scenario-print'))profile.artifacts.push('scenario-print');const settings={publish:{...defaultPublishProfile('gm'),showFactions:true},guides:{gm:defaultScenarioGuideOptions('gm'),player:defaultScenarioGuideOptions('player')},print:defaultPrintProfile(),pieces:defaultPieceSheetSelection()};
 const result=await builder.build(d,profile,settings),files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
 for(const [path,bytes]of Object.entries(files)){if(path.endsWith('.png'))continue;const text=new TextDecoder().decode(bytes);if(kind==='player'||path.startsWith('player/')||/manifest|README/i.test(path))assert.doesNotMatch(text,/FACTION_PRIVATE|ENTITY_PRIVATE|sourceFactionId|factionId|mapColor|#BA6157|#557BB5|#59966D/,path);}
 if(kind==='player'){assert.ok(pngs.every(svg=>!/FACTION_PRIVATE|#BA6157|#557BB5|#59966D/.test(svg)));assert.ok(Object.values(files).some(bytes=>new TextDecoder().decode(bytes).includes('地下の見張り団')));}else{assert.ok(Object.entries(files).some(([path,bytes])=>path.includes('gm/')&&path.endsWith('.svg')&&new TextDecoder().decode(bytes).includes('FACTION_PRIVATE_A')));}
 if(kind==='complete'){const restored=parseDungeonJson(new TextDecoder().decode(files['project/dungeon.json'])).dungeon;assert.deepEqual(restored.factions,d.factions);assert.deepEqual(restored.factionRelations,d.factionRelations);assert.deepEqual(restored.roomFactionAssignments,d.roomFactionAssignments);assert.deepEqual(restored.entities,d.entities);}
});
