import {createDungeonDocument,createPlacedRoom,createConnection} from '../../src/model/dungeonFactory';
import {DEFAULT_PIECES} from '../../src/model/pieceLibrary';
import {CONTENT_KINDS} from '../../src/model/content';
import {createThemeAssignment} from '../../src/model/dungeonTheme';
import {createRoomThemeAssignment} from '../../src/model/roomTheme';
import {prepareRequiredPlacement} from '../../src/model/roomThemePlacement';
import {createFactionInstance,emptyRoomFaction} from '../../src/model/factionState';
import {prepareEncounterPlan,applyEncounterPlan} from '../../src/model/encounter/application';
import {resolveEncounter} from '../../src/model/encounter/resolver';
import {createConnectionSceneResolver} from '../../src/editor/connectors/corridor/connectionScene';
import {assertDungeonDocument} from '../../src/model/dungeonValidation';
import {contentFixture,entityTimestamp} from './entityFixture';
import {themeFixture} from './themeFixture';
import {roomThemeFixture} from './roomThemeFixture';
import {factionFixture} from './factionFixture';
import {encounterTemplateFixture} from './encounterFixture';
import {newEncounterTemplate} from '../../src/model/encounter/template';

/** Fixed production workflow, assembled through domain APIs without a Store or React Component. */
export function integratedScenario(){
 const contents=CONTENT_KINDS.map(contentFixture),theme=themeFixture('AUDIT_PRIVATE_THEME'),roomTheme=roomThemeFixture('AUDIT_PRIVATE_ROOM_THEME');
 theme.pieceSelection.mode='all';theme.roomThemeSelection.mode='all';theme.factionSelection.mode='all';theme.encounterSelection.mode='all';roomTheme.encounterSelection.mode='all';
 for(const policy of Object.values(theme.contentSelection))policy.mode='all';
 const factionDefinitions=['亡霊','ゴブリン','盗賊'].map((name,i)=>{const f=factionFixture(`AUDIT_PRIVATE_FACTION_DEFINITION_${i}`);f.name=`AUDIT_PRIVATE_${name}`;f.encounterSelection.mode='all';f.memberSelection.monster.mode='all';f.memberSelection.npc.mode='all';return f;});
 const template=encounterTemplateFixture();
 let document=createDungeonDocument({id:'AUDIT_PRIVATE_DOCUMENT',name:'廃棄された古城',createdAt:entityTimestamp});
 document.markdown='# AUDIT_PRIVATE_SCENARIO';document.theme=createThemeAssignment(theme);
 for(let i=0;i<8;i++){
  const piece=DEFAULT_PIECES[i===2?2:0],room=createPlacedRoom(piece,{x:(i%4)*12,y:Math.floor(i/4)*14},document.rooms,i===2?90:0,`AUDIT_PRIVATE_ROOM_${i}`);
  room.information.name=`AUDIT_PRIVATE_ROOM_NAME_${i}`;room.information.gmNotes='AUDIT_PRIVATE_ROOM_NOTES';room.roomTheme=createRoomThemeAssignment(roomTheme);document.rooms.push(room);
 }
 for(const [a,b,secret]of [[0,1,false],[1,2,false],[2,3,false],[3,7,true]] as const){
  const from=document.rooms[a],to=document.rooms[b],used=new Set(document.connections.flatMap(c=>[`${c.fromRoomId}/${c.fromConnectorId}`,`${c.toRoomId}/${c.toConnectorId}`]));
  const f=from.piece.connectors.find(c=>!used.has(`${from.id}/${c.id}`)&&c.direction===(secret?'south':'east'))??from.piece.connectors.find(c=>!used.has(`${from.id}/${c.id}`))!;
  const t=to.piece.connectors.find(c=>!used.has(`${to.id}/${c.id}`)&&c.direction===(secret?'north':'west'))??to.piece.connectors.find(c=>!used.has(`${to.id}/${c.id}`))!;
  document.connections.push(createConnection(document.rooms,document.connections,{roomId:from.id,connectorId:f.id},{roomId:to.id,connectorId:t.id},secret?'secret':'corridor',`AUDIT_PRIVATE_LINK_${a}_${b}`));
 }
 for(const room of document.rooms){const plan=prepareRequiredPlacement(document,room.id,contents,DEFAULT_PIECES);if(plan.blockers.length)throw new Error(plan.blockers.join(' '));document.entities.push(...plan.added);}
 document.factions=factionDefinitions.map((f,i)=>({...createFactionInstance(f,i),id:`AUDIT_PRIVATE_FACTION_INSTANCE_${i}`}));
 document.factionRelations=[{id:'AUDIT_PRIVATE_RELATION',factionAId:document.factions[0].id,factionBId:document.factions[1].id,kind:'hostile',gmNotes:'AUDIT_PRIVATE_RELATION_GM'}];
 document.roomFactionAssignments=document.rooms.map((room,i)=>({...emptyRoomFaction(room.id),...(i===1?{status:'contested' as const,contestingFactionIds:document.factions.slice(0,2).map(f=>f.id)}:{status:'controlled' as const,controllingFactionId:document.factions[0].id})}));
 const scene=createConnectionSceneResolver()(document.rooms,document.connections),successfulConnectionIds=new Set(scene.drawings.filter(d=>d.result.status==='success'&&(d.connection.type!=='corridor'||d.corridor?.status==='success')).map(d=>d.connection.id));
 const bindings=[{roleId:'role-guard',factionId:document.factions[0].id},{roleId:'role-prisoner',factionId:document.factions[1].id}];
 const context=()=>({dungeon:document,roomId:document.rooms[0].id,contents,successfulConnectionIds});
 const resolution=resolveEncounter(template,context(),bindings);
 if(resolution.errors.length)throw new Error(resolution.errors.join(' '));
 const choices=template.entries.map(e=>({entryId:e.id,included:e.required,contentId:e.source.mode==='fixed'?e.source.contentId:undefined,quantity:e.quantity.min}));
 const plan=prepareEncounterPlan(template,context(),bindings,choices);document={...document,...applyEncounterPlan(document,plan,contents,successfulConnectionIds)};
 document.encounters[0].visibility='public';document.encounters[0].situation='AUDIT_PRIVATE_EDITED_SITUATION';document.encounters[0].publicDescription='部屋の奥から鎖の音が聞こえる。';
 const member=document.entities.find(e=>e.origin?.type==='encounter')!;member.quantity=3;member.customName='AUDIT_PRIVATE_EDITED_GUARD';member.visibility='public';member.publicDescription='入口を見張る武装した影がある。';
 const empty={...newEncounterTemplate(),id:'AUDIT_PRIVATE_EMPTY_TEMPLATE',name:'AUDIT_PRIVATE_BELL',createdAt:entityTimestamp,updatedAt:entityTimestamp};
 const emptyContext={...context(),roomId:document.rooms[6].id},emptyPlan=prepareEncounterPlan(empty,emptyContext,[],[]);document={...document,...applyEncounterPlan(document,emptyPlan,contents,successfulConnectionIds)};
 document.factions[2].visibility='public';document.factions[2].publicName='地下の巡回者';document.factions[2].publicDescription='廃城の地下を歩く一団。';
 document=assertDungeonDocument(document);
 return {document,contents,theme,roomTheme,factionDefinitions,templates:[template,empty],successfulConnectionIds};
}
