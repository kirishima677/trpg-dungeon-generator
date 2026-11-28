import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {JSDOM} from 'jsdom';
import {unzipSync} from 'fflate';
import {integratedScenario} from './fixtures/integratedScenario';
import {validateDungeonDocument,assertDungeonDocument} from '../src/model/dungeonValidation';
import {buildExportEnvelope,parseDungeonJson} from '../src/utils/exportImport';
import {duplicateRoomDocument,deleteRoomDocument,deleteEncounterDocument} from '../src/model/dungeonCommands';
import {applyFactionCommand} from '../src/model/factionState';
import {createConnectionSceneResolver} from '../src/editor/connectors/corridor/connectionScene';
import {dungeonRepository} from '../src/repository/dungeonRepository';
import {db} from '../src/db/db';
import {defaultPublishProfile} from '../src/publishing/publishProfile';
import {defaultScenarioGuideOptions} from '../src/publishing/scenario/scenarioGuide';
import {defaultPackageProfile} from '../src/publishing/package/packagePlan';
import {defaultPrintProfile} from '../src/publishing/print/printProfile';
import {defaultPieceSheetSelection} from '../src/publishing/pieceSheet/inventory';
const dom=new JSDOM('');Object.assign(globalThis,{window:dom.window});
const {createPublicationSession}=await import('../src/publishing/publicationSession'),{createPackageBuilder}=await import('../src/publishing/package/buildPackage');
after(async()=>{await db.delete();dom.window.close();});
const privatePattern=/AUDIT_PRIVATE|ENCOUNTER_PRIVATE|FACTION_PRIVATE|ENTITY_PRIVATE|ROOM_THEME_PRIVATE|THEME_PRIVATE|role-guard|entry-guard/;

test('non-UI integrated workflow builds all models, saves/reopens and restores from JSON without any libraries',async()=>{
 const {document:d}=integratedScenario();assert.equal(d.rooms.length,8);assert.equal(d.encounters.length,2);assert.equal(d.entities.length,10);assert.equal(d.rooms[2].rotation,90);assert.equal(d.rooms[2].piece.shape,'l-shape');assert.ok(d.connections.some(c=>c.type==='secret'));
 const frozen=structuredClone(d),restored=parseDungeonJson(JSON.stringify(buildExportEnvelope(d))).dungeon;assert.deepEqual(restored,d);
 assert.equal(await db.contentDefinitions.count(),0);assert.equal(await db.encounterTemplates.count(),0);await dungeonRepository.save(restored);await db.close();await db.open();assert.deepEqual(await dungeonRepository.load(d.id),d);assert.deepEqual(d,frozen);
 const resolve=createConnectionSceneResolver(),scene=resolve(d.rooms,d.connections);const metadata=structuredClone(d);metadata.encounters[0].situation='編集';metadata.entities[0].quantity=42;metadata.rooms[0].information.name='変更';assert.strictEqual(resolve(metadata.rooms,metadata.connections),scene);
 metadata.rooms[0].position.x-=2;assert.notStrictEqual(resolve(metadata.rooms,metadata.connections),scene);
});
test('integrated compound deletion/duplication sequence always preserves internal references and snapshots',()=>{
 const {document:d}=integratedScenario(),before=structuredClone(d);let current=d;
 for(const step of [()=>duplicateRoomDocument(current,current.rooms[0].id).document,()=>({...current,...applyFactionCommand(current,{type:'delete',id:current.factions[0].id})}),()=>deleteEncounterDocument(current,current.encounters[0].id,false),()=>deleteRoomDocument(current,current.rooms[1].id)!]){
  current=step();assertDungeonDocument(current);
  for(const values of [current.rooms,current.entities,current.factions,current.encounters])assert.equal(new Set(values.map(v=>v.id)).size,values.length);
 }
 assert.deepEqual(d,before);assert.ok(current.entities.some(e=>e.origin?.type==='room-theme-required'));
});
test('integrated invalid combinations reject duplicate identities, quantities, shared endpoints and cross-room origins',()=>{
 const {document:d}=integratedScenario();
 const changes=[(v:typeof d)=>v.rooms.push(structuredClone(v.rooms[0])),(v:typeof d)=>v.entities.push(structuredClone(v.entities[0])),(v:typeof d)=>v.factions.push(structuredClone(v.factions[0])),(v:typeof d)=>v.encounters.push(structuredClone(v.encounters[0])),(v:typeof d)=>{v.entities[0].quantity=0;},(v:typeof d)=>v.connections.push({...v.connections[0],id:'another'}),(v:typeof d)=>{v.entities.find(e=>e.origin?.type==='encounter')!.roomId=v.rooms[1].id;},(v:typeof d)=>v.factionRelations.push({...v.factionRelations[0],id:'another'})];
 for(const change of changes){const invalid=structuredClone(d);change(invalid);assert.equal(validateDungeonDocument(invalid).valid,false);}
});
for(const kind of ['player','complete'] as const)test(`integrated ${kind} package checks every file and PNG drawing input`,async()=>{
 const {document:d}=integratedScenario(),pngInputs:string[]=[];
 const settings={publish:defaultPublishProfile('gm'),guides:{gm:defaultScenarioGuideOptions('gm'),player:defaultScenarioGuideOptions('player')},print:defaultPrintProfile(),pieces:defaultPieceSheetSelection()};
 const profile=defaultPackageProfile(kind);if(kind==='player')profile.artifacts.push('scenario-print','piece-sheets','piece-inventory');
 const builder=createPackageBuilder({png:async svg=>{pngInputs.push(svg);return new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});}}),result=await builder.build(d,profile,settings,{allowIncomplete:true}),files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
 for(const [path,data]of Object.entries(files))if(kind==='player'||path.startsWith('player/')||/README|manifest/.test(path)){assert.doesNotMatch(path,privatePattern);if(!path.endsWith('.png'))assert.doesNotMatch(new TextDecoder().decode(data),privatePattern,path);}
 assert.equal(pngInputs.length,kind==='player'?1:2);for(const svg of pngInputs.slice(-1)){assert.doesNotMatch(svg,/AUDIT_PRIVATE|ENCOUNTER_PRIVATE|FACTION_PRIVATE|ENTITY_PRIVATE|faction-legend|faction-cell/);}
 const guide=new TextDecoder().decode(files[kind==='player'?'guide/scenario-guide.html':'player/guide/scenario-guide.html']);assert.match(guide,/鎖の音/);assert.match(guide,/武装した影/);
 if(kind==='complete')assert.deepEqual(parseDungeonJson(new TextDecoder().decode(files['project/dungeon.json'])).dungeon,d);
 const gm=createPublicationSession(d).guide(defaultPublishProfile('gm'),{...defaultScenarioGuideOptions('gm'),includeMap:false}).html;assert.match(gm,/AUDIT_PRIVATE_EDITED_GUARD × 3/);assert.equal((gm.match(/AUDIT_PRIVATE_EDITED_GUARD × 3/g)||[]).length,1);
});
