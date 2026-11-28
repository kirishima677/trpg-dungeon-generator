import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveEncounter,encounterRoleFeasibility} from '../src/model/encounter/resolver';
import {encounterContextFixture,encounterTemplateFixture,encounterBindings,encounterChoices} from './fixtures/encounterFixture';
import {prepareEncounterPlan} from '../src/model/encounter/application';
import {themeFixture} from './fixtures/themeFixture';
import {roomThemeFixture} from './fixtures/roomThemeFixture';
import {intersectById} from '../src/model/selectionSets';

test('typed Encounter diagnostics distinguish binding structure/reference, optional materials and unevaluated routes',()=>{
 const ctx=encounterContextFixture(),t=encounterTemplateFixture();t.applicability.minConnectedRooms=1;
 const unknown=resolveEncounter(t,{...ctx,successfulConnectionIds:undefined});
 assert.ok(unknown.diagnostics.some(d=>d.code==='connections-unevaluated'&&d.category==='evaluation'&&d.severity==='error'));
 assert.equal(unknown.diagnostics.filter(d=>d.code==='role-unbound').length,2);
 const duplicate=resolveEncounter(t,ctx,[{roleId:'role-guard',factionId:ctx.dungeon.factions[0].id},{roleId:'role-prisoner',factionId:ctx.dungeon.factions[0].id}]);assert.ok(duplicate.diagnostics.some(d=>d.code==='binding-duplicate-faction'&&d.category==='structure'));
 const missing=resolveEncounter(t,ctx,[{roleId:'role-guard',factionId:'missing'}]);assert.ok(missing.diagnostics.some(d=>d.code==='role-missing-faction'&&d.context?.roleId==='role-guard'));
 const optional=resolveEncounter(t,{...ctx,contents:ctx.contents.filter(c=>c.kind!=='event')},encounterBindings(ctx));assert.ok(optional.diagnostics.some(d=>d.code==='entry-content-invalid'&&d.context?.entryId==='entry-alarm'));
 assert.equal(t.entries.find(e=>e.id==='entry-alarm')!.required,false);assert.equal(encounterRoleFeasibility(t,ctx,0).status,'incomplete');
});
for(const layer of ['dungeon','room','faction'] as const)test(`typed diagnostics identify ${layer} as the stage that removes otherwise available Content`,()=>{
 const ctx=encounterContextFixture(),template=encounterTemplateFixture();
 if(layer==='dungeon'){const t=themeFixture();ctx.dungeon.theme={sourceThemeId:t.id,themeSnapshot:t};}
 if(layer==='room'){const t=roomThemeFixture();t.contentSelection.monster.mode='none';ctx.dungeon.rooms[0].roomTheme={sourceThemeId:t.id,themeSnapshot:t};}
 if(layer==='faction')ctx.dungeon.factions[0].factionSnapshot.memberSelection.monster.mode='none';
 const result=resolveEncounter(template,ctx,encounterBindings(ctx));assert.ok(result.diagnostics.some(d=>d.code===`entry-excluded-${layer}`&&d.context?.entryId==='entry-guard'));
 assert.throws(()=>prepareEncounterPlan(template,ctx,encounterBindings(ctx),encounterChoices()),/例外適用/);
 assert.ok(prepareEncounterPlan(template,ctx,encounterBindings(ctx),encounterChoices(),true).acceptedWarnings.length);
});
test('ID intersection preserves input ordering and objects, separates missing restrictions from none and never mutates libraries',()=>{
 const a=Object.freeze({id:'b'}),b=Object.freeze({id:'a'}),values=Object.freeze([a,b]);
 assert.deepEqual(intersectById(values,[]),[a,b]);assert.deepEqual(intersectById(values,[[]]),[]);
 const result=intersectById(values,[[{id:'a'},{id:'b'}],[{id:'b'}]]);assert.deepEqual(result,[a]);assert.strictEqual(result[0],a);assert.deepEqual(values,[a,b]);
});
