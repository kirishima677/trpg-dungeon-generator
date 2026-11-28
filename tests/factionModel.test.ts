import assert from 'node:assert/strict';
import {test} from 'node:test';
import {factionFixture,factionDungeon} from './fixtures/factionFixture';
import {contentFixture} from './fixtures/entityFixture';
import {themeFixture} from './fixtures/themeFixture';
import {roomThemeFixture} from './fixtures/roomThemeFixture';
import {newFaction,normalizeFaction,normalizeFactionDraft,duplicateFaction,sameFaction,FACTION_LIMITS} from '../src/model/faction';
import {newTheme,normalizeTheme} from '../src/model/dungeonTheme';
import {newRoomTheme} from '../src/model/roomTheme';
import {resolveFaction} from '../src/model/factionResolver';
import {resolveFactionSelection,emptyFactionSelection,emptyRoomThemeSelection} from '../src/model/themeSelection';
import {buildFactionExport,parseFactionJson} from '../src/factions/factionJson';
import {toFactionForm,fromFactionForm} from '../src/factions/factionForm';
import {normalizeFactionState,applyFactionCommand,createFactionInstance,emptyRoomFaction} from '../src/model/factionState';
import {factionStatistics,factionDiagnostics} from '../src/model/factionResolver';

test('new definition is unsaved, empty and none; copy deeply preserves weak references under a new ID',()=>{
 const a=newFaction(),b=newFaction();assert.notEqual(a.id,b.id);assert.equal(a.name,'');assert.equal(a.memberSelection.monster.mode,'none');assert.equal(a.roomThemeSelection.mode,'none');assert.equal(Object.hasOwn(a,'createdAt'),false);
 const f=factionFixture();f.memberSelection.monster.includeContentIds=['missing'];const copy=duplicateFaction(f);copy.memberSelection.monster.includeContentIds.push('other');assert.notEqual(copy.id,f.id);assert.deepEqual(f.memberSelection.monster.includeContentIds,['missing']);assert.deepEqual(fromFactionForm(toFactionForm(f)),normalizeFactionDraft(f));
});
for(const [field,value] of [['name',''],['objectives','x'.repeat(FACTION_LIMITS.markdown+1)],['behavior',false],['memberSelection',{}],['createdAt','bad'],['roomThemeSelection',null]] as const)test(`definition rejects invalid ${field}`,()=>assert.throws(()=>normalizeFaction({...factionFixture(),[field]:value})));
test('definition rejects extra member kinds, reversed dates and oversize snapshots',()=>{
 const f=factionFixture();assert.throws(()=>normalizeFaction({...f,memberSelection:{...f.memberSelection,object:f.memberSelection.monster}}));assert.throws(()=>normalizeFaction({...f,createdAt:'2027-01-01T00:00:00.000Z'}));assert.throws(()=>normalizeFaction({...f,description:'界'.repeat(100000),objectives:'界'.repeat(100000)}));
});
test('identity ignores dates, tag/set order but detects policy differences',()=>{
 const a=factionFixture(),b=structuredClone(a);a.tags=['a','b'];b.tags=['b','a'];b.updatedAt='2027-01-01T00:00:00.000Z';assert.ok(sameFaction(a,b));b.behavior='different';assert.ok(!sameFaction(a,b));
});
test('old Dungeon themes allow all factions, new ones none, Room Themes contain no Dungeon-only policy',()=>{
 const {factionSelection:_old,...old}=themeFixture();assert.equal(normalizeTheme(old).factionSelection.mode,'all');assert.equal(newTheme().factionSelection.mode,'none');assert.equal(Object.hasOwn(newRoomTheme(),'factionSelection'),false);
});
for(const mode of ['all','filtered','explicit','none'] as const)test(`Faction selection ${mode} uses shared exclusions and stable ID order`,()=>{
 const a=factionFixture('b'),b=factionFixture('a'),p=emptyFactionSelection(mode);p.tags.allOf=['地下'];p.includeFactionIds=['b'];p.excludeFactionIds=['b'];const r=resolveFactionSelection(p,[a,b]);assert.deepEqual(r.candidates.map(f=>f.id),mode==='none'||mode==='explicit'?[]:['a']);
});
test('resolver intersects Monster/NPC and room candidates, unset themes are unrestricted and none remains empty',()=>{
 const f=factionFixture(),m=contentFixture(),n=contentFixture('npc'),r=roomThemeFixture();f.memberSelection.monster.mode='all';f.memberSelection.npc.mode='all';f.roomThemeSelection.mode='all';
 const before=JSON.stringify([f,m,n,r]);assert.deepEqual(resolveFaction(f,[n,m],[r]).members.monster,[m]);const d=themeFixture();d.contentSelection.monster.mode='all';d.roomThemeSelection=emptyRoomThemeSelection('all');d.factionSelection=emptyFactionSelection('all');
 const out=resolveFaction(f,[m,n],[r],d);assert.deepEqual(out.members.monster,[m]);assert.deepEqual(out.members.npc,[]);assert.deepEqual(out.roomThemes,[r]);r.contentSelection.monster.mode='none';assert.deepEqual(resolveFaction(f,[m,n],[r],d,r).members.monster,[]);r.contentSelection.monster.mode='all';assert.equal(JSON.stringify([f,m,n,r]),before);
});
test('resolver diagnoses weak refs, wrong kind, exclusion conflicts and theme mismatch without mutation',()=>{
 const f=factionFixture();f.memberSelection.monster.mode='explicit';f.memberSelection.monster.includeContentIds=['missing',contentFixture('npc').id];f.memberSelection.monster.excludeContentIds=['missing'];const out=resolveFaction(f,[contentFixture('npc')],[],themeFixture());assert.equal(out.members.monster.length,0);assert.match(out.warnings.join(' '),/見つかりません/);assert.match(out.warnings.join(' '),/一致しません/);assert.match(out.warnings.join(' '),/候補外/);
});
test('single/library export roundtrip, duplicate keys/IDs, envelope versions/types and limits are checked before use',()=>{
 const f=factionFixture();for(const single of [true,false])assert.deepEqual(parseFactionJson(JSON.stringify(buildFactionExport([f],single))),[f]);
 for(const json of ['{','{"schemaVersion":"1.0.0","schemaVersion":"1.0.0","type":"faction-library","factions":[]}',JSON.stringify({schemaVersion:'2.0.0',type:'faction-library',factions:[]}),JSON.stringify({schemaVersion:'1.0.0',type:'wrong'}),JSON.stringify({schemaVersion:'1.0.0',type:'faction-library',factions:[f,f]})])assert.throws(()=>parseFactionJson(json));assert.throws(()=>buildFactionExport(Array(501).fill(f)));assert.throws(()=>buildFactionExport([],true));
});
test('instances from a single source are independent and refresh changes snapshot only',()=>{
 const d=factionDungeon(),a=d.factions[0],b=createFactionInstance(a.factionSnapshot);assert.notEqual(a.id,b.id);b.factionSnapshot.name='other';assert.notEqual(a.factionSnapshot.name,b.factionSnapshot.name);
 const before=structuredClone(d),updated={...a.factionSnapshot,name:'new'};const state=applyFactionCommand(d,{type:'refresh',id:a.id,definition:updated});assert.equal(state.factions[0].factionSnapshot.name,'new');assert.deepEqual({...state.factions[0],factionSnapshot:a.factionSnapshot},a);assert.deepEqual(state.factionRelations,d.factionRelations);assert.deepEqual(d,before);assert.throws(()=>applyFactionCommand(d,{type:'refresh',id:a.id,definition:factionFixture('wrong')}));
});
test('duplicate copies local/snapshot data only, no territory/member/relations',()=>{
 const d=factionDungeon(),out=applyFactionCommand(d,{type:'duplicate',id:d.factions[0].id});assert.equal(out.factions.length,4);assert.notEqual(out.factions[3].id,d.factions[0].id);assert.deepEqual(out.entities,d.entities);assert.deepEqual(out.roomFactionAssignments,d.roomFactionAssignments);assert.deepEqual(out.factionRelations,d.factionRelations);
});
for(const mutate of [
 (d:ReturnType<typeof factionDungeon>)=>d.factions.push(d.factions[0]),
 (d:ReturnType<typeof factionDungeon>)=>d.factions[0].mapColor='url(https://evil)',
 (d:ReturnType<typeof factionDungeon>)=>d.factionRelations.push({...d.factionRelations[0],id:'second',factionAId:d.factionRelations[0].factionBId,factionBId:d.factionRelations[0].factionAId}),
 (d:ReturnType<typeof factionDungeon>)=>d.factionRelations[0].factionAId=d.factionRelations[0].factionBId,
 (d:ReturnType<typeof factionDungeon>)=>d.entities[0].factionId='missing',
 (d:ReturnType<typeof factionDungeon>)=>d.roomFactionAssignments[0].controllingFactionId='missing',
 (d:ReturnType<typeof factionDungeon>)=>d.roomFactionAssignments[1].contestingFactionIds=[d.factions[0].id,d.factions[0].id],
 (d:ReturnType<typeof factionDungeon>)=>d.roomFactionAssignments.push(d.roomFactionAssignments[0]),
 (d:ReturnType<typeof factionDungeon>)=>d.roomFactionAssignments[1].contestingFactionIds=[d.factions[0].id],
 (d:ReturnType<typeof factionDungeon>)=>d.roomFactionAssignments[0].status='unclaimed',
 (d:ReturnType<typeof factionDungeon>)=>d.entities[0].contentSnapshot.kind='object',
])test(`cross-reference invariant ${mutate.toString().slice(0,100)}`,()=>{const d=factionDungeon();mutate(d);assert.throws(()=>normalizeFactionState(d,d.rooms,d.entities));});
test('relation canonicalization preserves explicit unknown versus absence',()=>{const d=factionDungeon();const r=d.factionRelations[0];[r.factionAId,r.factionBId]=[r.factionBId,r.factionAId];r.kind='unknown';const result=normalizeFactionState(d,d.rooms,d.entities);assert.ok(result.factionRelations[0].factionAId<result.factionRelations[0].factionBId);assert.equal(result.factionRelations[0].kind,'unknown');assert.equal(result.factionRelations.length,1);});
test('delete clears membership/relations and preserves rooms/entities/use/notes while normalizing contests 3→2→controlled→unclaimed',()=>{
 let d=factionDungeon();const original=structuredClone(d);for(let i=0;i<3;i++) {const id=d.factions[0].id;d={...d,...applyFactionCommand(d,{type:'delete',id})};if(i===0){assert.equal(d.roomFactionAssignments[0].status,'unclaimed');assert.equal(d.roomFactionAssignments[0].currentUse,original.roomFactionAssignments[0].currentUse);assert.equal(d.roomFactionAssignments[0].gmNotes,original.roomFactionAssignments[0].gmNotes);assert.equal(d.roomFactionAssignments[1].contestingFactionIds.length,2);assert.equal(d.entities[0].factionId,undefined);}if(i===1)assert.equal(d.roomFactionAssignments[1].status,'controlled');}
 assert.equal(d.roomFactionAssignments[1].status,'unclaimed');assert.equal(d.entities.length,2);assert.deepEqual(d.rooms,original.rooms);assert.equal(d.factionRelations.length,0);
});
test('statistics derive groups/quantity; hostile coexistence, foreign members and candidate mismatches warn only',()=>{
 const d=factionDungeon(),id=d.factions[0].id,s=factionStatistics(d,id);assert.equal(s.controlled,1);assert.equal(s.contested,1);assert.deepEqual(s.monster,{groups:1,quantity:4});assert.equal(s.relations,1);const warnings=factionDiagnostics(d);assert.match(warnings.join(' '),/敵対/);assert.match(warnings.join(' '),/異なる所属/);assert.match(warnings.join(' '),/構成候補外/);
 const out=applyFactionCommand(d,{type:'assign-rooms',assignments:[{...emptyRoomFaction(d.rooms[0].id),status:'controlled',controllingFactionId:d.factions[2].id}]});assert.equal(out.roomFactionAssignments.find(a=>a.roomId===d.rooms[0].id)!.controllingFactionId,d.factions[2].id);
});

for(const mode of ['all','filtered','explicit','none'] as const)test(`member ${mode} respects tags, explicit IDs, exclusion priority and deterministic order`,()=>{
 const f=factionFixture(),a={...contentFixture(),id:'a',tags:['地下']},b={...contentFixture(),id:'b',tags:['地上']},c={...contentFixture(),id:'c',tags:['地下']};
 f.memberSelection.monster={mode,includeContentIds:['b','a'],excludeContentIds:['a'],tags:{allOf:['地下'],anyOf:[],noneOf:[]}};
 const out=resolveFaction(f,[c,contentFixture('object'),b,a],[]);assert.deepEqual(out.members.monster.map(v=>v.id),mode==='none'?[]:mode==='explicit'?['b']:['b','c']);assert.deepEqual(resolveFaction(f,[a,b,c],[]).members,out.members);assert.deepEqual(out.members.npc,[]);
});
for(const kind of ['allied','friendly','neutral','rival','hostile','unknown'] as const)test(`symmetric relation ${kind} can be updated and removed without touching entities or territory`,()=>{
 const d=factionDungeon(),r={...d.factionRelations[0],kind},updated=applyFactionCommand(d,{type:'relation',relation:r});assert.equal(updated.factionRelations.length,1);assert.equal(updated.factionRelations[0].kind,kind);assert.deepEqual(updated.entities,d.entities);const removed=applyFactionCommand({...d,...updated},{type:'delete-relation',id:r.id});assert.equal(removed.factionRelations.length,0);assert.deepEqual(removed.roomFactionAssignments,d.roomFactionAssignments);
});
test('instance/assignment upper bounds reject excess state without truncation',()=>{
 const d=factionDungeon();assert.throws(()=>normalizeFactionState({...d,factions:Array(51).fill(d.factions[0])},d.rooms,[]));assert.throws(()=>normalizeFactionState({...d,roomFactionAssignments:Array(1001).fill(emptyRoomFaction(d.rooms[0].id))},d.rooms,[]));const a={...d.roomFactionAssignments[1],contestingFactionIds:Array(11).fill(d.factions[0].id)};assert.throws(()=>normalizeFactionState({...d,roomFactionAssignments:[a]},d.rooms,[]));
});

test('duplicating a maximum-length definition remains valid; Instance duplication preserves every local text field',()=>{
 const f={...factionFixture(),name:'界'.repeat(200)},copy=duplicateFaction(f);assert.doesNotThrow(()=>normalizeFactionDraft(copy));assert.equal(copy.name,f.name);
 const d=factionDungeon();Object.assign(d.factions[0],{customName:'界'.repeat(200),publicName:'公の名称',publicDescription:'説明',currentObjectives:'目的',currentSituation:'状況',gmNotes:'秘密',visibility:'public'});const out=applyFactionCommand(d,{type:'duplicate',id:d.factions[0].id}),duplicate=out.factions.at(-1)!;
 for(const key of ['customName','currentObjectives','currentSituation','gmNotes','visibility','publicName','publicDescription'] as const)assert.equal(duplicate[key],d.factions[0][key]);assert.deepEqual(duplicate.factionSnapshot,d.factions[0].factionSnapshot);assert.notStrictEqual(duplicate.factionSnapshot,d.factions[0].factionSnapshot);
});
