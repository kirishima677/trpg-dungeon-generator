import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {JSDOM} from 'jsdom';
import {auditDataset} from '../tests/fixtures/auditDataset';
import {normalizeDungeonDocument} from '../src/model/normalizeDungeon';
import {createConnectionSceneResolver} from '../src/editor/connectors/corridor/connectionScene';
import {resolveRoomTheme} from '../src/model/roomThemeResolver';
import {resolveFaction} from '../src/model/factionResolver';
import {resolveEncounter} from '../src/model/encounter/resolver';
import {encounterRevision} from '../src/model/encounter/application';
import {createEntityInstance} from '../src/model/entity';
import {buildExportEnvelope,parseDungeonJson} from '../src/utils/exportImport';
import {defaultPublishProfile} from '../src/publishing/publishProfile';
import {defaultScenarioGuideOptions} from '../src/publishing/scenario/scenarioGuide';
import {defaultPrintProfile} from '../src/publishing/print/printProfile';
import {defaultPieceSheetSelection} from '../src/publishing/pieceSheet/inventory';
import {defaultPackageProfile} from '../src/publishing/package/packagePlan';
const dom=new JSDOM('');Object.assign(globalThis,{window:dom.window});
const start=performance.now();
const {useDungeonStore}=await import('../src/store/dungeonStore');
const {createPublicationSession}=await import('../src/publishing/publicationSession');
const {createPackageBuilder}=await import('../src/publishing/package/buildPackage');
const moduleLoadMs=performance.now()-start;
async function measure(fn:()=>unknown|Promise<unknown>) {await fn();const values=[];for(let i=0;i<5;i++){const start=performance.now();await fn();values.push(performance.now()-start);}values.sort((a,b)=>a-b);return {medianMs:+values[2].toFixed(3),minMs:+values[0].toFixed(3),maxMs:+values[4].toFixed(3)};}
const output=[];
for(const [rooms,entities,encounters]of [[10,30,5],[50,250,30],[100,500,80]]){
 const data=auditDataset(rooms,entities,encounters),d=data.dungeon,resolve=createConnectionSceneResolver();const scene=resolve(d.rooms,d.connections),context={dungeon:d,roomId:d.rooms[0].id,contents:data.contents,successfulConnectionIds:new Set(scene.drawings.filter(v=>v.result.status==='success').map(v=>v.connection.id))};
 const store=()=>useDungeonStore.getState(),json=JSON.stringify(buildExportEnvelope(d));store().setDungeon(d);
 const timings={
  normalize:await measure(()=>normalizeDungeonDocument(d)),
  storeLoad:await measure(()=>store().setDungeon(d)),
  addRoom:await measure(()=>{store().setDungeon(d);store().addRoom({...structuredClone(d.rooms[0]),id:'added-room',position:{x:200,y:200},information:undefined});}),
  moveRotate:await measure(()=>{store().setDungeon(d);store().moveRoom(d.rooms[0].id,{x:-20,y:0});store().rotateRoom(d.rooms[0].id);}),
  routeCold:await measure(()=>createConnectionSceneResolver()(d.rooms,d.connections)),
  routeCached:await measure(()=>resolve(d.rooms,d.connections)),
  entityBatch:await measure(()=>Array.from({length:30},()=>createEntityInstance(d.rooms[0].id,data.contents[0],d.rooms))),
  roomTheme:await measure(()=>resolveRoomTheme({dungeonTheme:data.theme,roomTheme:data.roomTheme,pieces:data.pieces,contents:data.contents})),
  faction:await measure(()=>resolveFaction(d.factions[0].factionSnapshot,data.contents,[data.roomTheme],data.theme,data.roomTheme)),
  encounter:await measure(()=>resolveEncounter(data.template,context)),
  encounterRevision:await measure(()=>encounterRevision(context,data.template)),
  jsonExport:await measure(()=>JSON.stringify(buildExportEnvelope(d))),jsonImport:await measure(()=>parseDungeonJson(json)),
  gmHTML:await measure(()=>createPublicationSession(d).guide(defaultPublishProfile('gm'),{...defaultScenarioGuideOptions('gm'),includeMap:false})),
  playerZIP:await measure(()=>createPackageBuilder().build(d,{...defaultPackageProfile('player'),artifacts:['map-svg','scenario-guide']},{publish:{...defaultPublishProfile('player'),pixelsPerCell:8},guides:{gm:{...defaultScenarioGuideOptions('gm'),includeMap:false},player:{...defaultScenarioGuideOptions('player'),includeMap:false}},print:defaultPrintProfile(),pieces:defaultPieceSheetSelection()})),
  undoRedo:await measure(()=>{store().setDungeon(d);store().updateRoomInformation(d.rooms[0].id,{...d.rooms[0].information,name:'変更'});store().undo();store().redo();})
 };
 output.push({rooms,entities,encounters,jsonBytes:Buffer.byteLength(json),documentBytes:Buffer.byteLength(JSON.stringify(d)),estimated50HistoryBytes:Buffer.byteLength(JSON.stringify(d))*50,timings});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0].model,moduleLoadMs,method:'one warmup, five samples, median; Store actions include reset; ZIP excludes PNG and includes real SVG/HTML/ZIP compression; HTML excludes map',output},null,2));dom.window.close();
