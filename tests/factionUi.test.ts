import type {FactionDraft,FactionDefinition} from '../src/model/faction';
import type {FactionForm} from '../src/factions/factionForm';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
import {JSDOM} from 'jsdom';
import {factionFixture,factionDungeon} from './fixtures/factionFixture';
import {contentFixture} from './fixtures/entityFixture';
import {roomThemeFixture} from './fixtures/roomThemeFixture';
import {themeFixture} from './fixtures/themeFixture';
import {buildFactionExport} from '../src/factions/factionJson';
import {FACTION_CHANNEL,FACTION_LIBRARY_UPDATED} from '../src/factions/factionEvents';
import {CONTENT_CHANNEL,CONTENT_LIBRARY_UPDATED} from '../src/content/contentEvents';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/?factionEditor=1'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
class Channel{static instances=new Set<Channel>();onmessage:((event:{data:unknown})=>void)|null=null;constructor(readonly name:string){Channel.instances.add(this);}postMessage(data:unknown){for(const c of Channel.instances)if(c!==this&&c.name===this.name)c.onmessage?.({data});}close(){Channel.instances.delete(this);}}
Object.assign(globalThis,{BroadcastChannel:Channel});
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const {db}=await import('../src/db/db'),{createFactionRepository}=await import('../src/repository/factionRepository'),{FactionEditor}=await import('../src/components/factions/FactionEditor'),{DungeonFactionPanel}=await import('../src/components/factions/DungeonFactionPanel'),{RoomFactionPanel}=await import('../src/components/factions/RoomFactionPanel'),{useDungeonStore}=await import('../src/store/dungeonStore'),{useLibraryEditor}=await import('../src/components/library/useLibraryEditor');
const {toFactionForm,fromFactionForm}=await import('../src/factions/factionForm'),{newFaction,duplicateFaction,FACTION_LIMITS}=await import('../src/model/faction'),{parseFactionJson}=await import('../src/factions/factionJson');
const repository=createFactionRepository(),doc=dom.window.document,state=()=>useDungeonStore.getState();let contents=[contentFixture(),contentFixture('npc')];
const materials={pieces:{list:async()=>[]},contents:{list:async()=>structuredClone(contents)}};
beforeEach(async()=>{for(const t of db.tables)await t.clear();state().setDungeon(factionDungeon());contents=[contentFixture(),contentFixture('npc')];});after(async()=>{await db.delete();dom.window.close();});
async function settle(predicate:()=>boolean){for(let i=0;i<120&&!predicate();i++)await act(async()=>{await new Promise(r=>setTimeout(r,2));});assert.ok(predicate(),'state did not settle');}
const field=(name:string)=>{const el=doc.querySelector(`[aria-label="${name}"]`);assert.ok(el,name);return el as HTMLInputElement&HTMLSelectElement&HTMLTextAreaElement;};
const button=(name:string)=>{const el=[...doc.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(el,name);return el;};
const click=(name:string)=>act(async()=>{button(name).click();await new Promise(r=>setTimeout(r,5));});
const input=(name:string,value:string)=>act(async()=>{const el=field(name),p=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value')!.set!.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
const select=(name:string,value:string)=>act(async()=>{const el=field(name);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
async function mount(component:React.ReactNode){const root=createRoot(doc.getElementById('root')!);await act(async()=>root.render(component));return ()=>act(async()=>root.unmount());}
async function notify(name:string,type:string){const c=new Channel(name);await act(async()=>c.postMessage({type}));c.close();}
test('Faction editor offers Monster/NPC only, read-only pickers, room policy, preview intersection and safe Markdown',async()=>{
 await db.roomThemes.add(roomThemeFixture());await db.dungeonThemes.add(themeFixture());const close=await mount(createElement(FactionEditor,{materials}));await settle(()=>!button('Export JSON').disabled);
 try{await input('勢力名称','地下の部族');assert.equal([...doc.querySelectorAll('button')].some(b=>b.textContent==='Piece候補'),false);await click('構成員候補');assert.equal([...doc.querySelectorAll('button')].some(b=>b.textContent==='Treasure'),false);await select('Monster選択モード','all');await click('NPC');await select('NPC選択モード','explicit');await click('NPC Libraryから明示指定');await act(async()=>field(`${contentFixture('npc').name}（${contentFixture('npc').id}）をテーマ候補に選択`).click());await click('選択を反映');await click('推奨Room Theme');await select('Room Theme選択モード','all');await click('候補プレビュー');assert.match(doc.body.textContent!,/monster: 1件/);assert.match(doc.body.textContent!,/npc: 1件/);await select('統合Dungeon Theme',themeFixture().id);assert.match(doc.body.textContent!,/monster: 0件/);await click('Markdown');await input('勢力詳細（Markdown）','## 背景\n**強調**<img src=x onerror=alert(1)><script>alert(1)</script>');assert.equal(field('勢力詳細のプレビュー').querySelector('img,script,[onerror]'),null);await click('保存');await settle(()=>doc.body.textContent!.includes('保存しました。'));assert.equal((await repository.list())[0].memberSelection.npc.includeContentIds[0],contentFixture('npc').id);assert.equal(await db.contentDefinitions.count(),0);
 }finally{await close();}
});
test('library refresh retains dirty editing, broadcasts reload preview, CAS rejects stale saves and export scopes use saved values',async()=>{
 const saved=await repository.save(factionFixture(),null),outputs:unknown[]=[];const close=await mount(createElement(FactionEditor,{materials,download:v=>outputs.push(v)}));await settle(()=>!!doc.querySelector('aside .content-item'));
 try{await act(async()=>doc.querySelector<HTMLButtonElement>('aside .content-item')!.click());await settle(()=>field('勢力名称').value===saved.name);await input('勢力名称','未保存');await act(async()=>repository.save({...saved,name:'外部更新'},saved.updatedAt));await settle(()=>doc.body.textContent!.includes('未保存の編集は保持'));assert.equal(field('勢力名称').value,'未保存');await click('保存');assert.match(doc.body.textContent!,/別ウィンドウ/);await click('Export JSON');assert.equal((outputs[0] as {faction:{name:string}}).faction.name,'外部更新');await click('新規');await click('キャンセル');assert.equal(field('勢力名称').value,'未保存');await click('新規');await click('変更を破棄して続ける');assert.equal(field('勢力名称').value,'');
 await input('勢力名称','プレビュー保持');await click('構成員候補');await select('Monster選択モード','all');await click('候補プレビュー');assert.match(doc.body.textContent!,/monster: 1件/);contents=[...contents,{...contentFixture(),id:'second'}];await notify(CONTENT_CHANNEL,CONTENT_LIBRARY_UPDATED);await settle(()=>doc.body.textContent!.includes('monster: 2件'));assert.equal(field('勢力名称').value,'プレビュー保持');
 }finally{await close();}
});
test('shared Faction editing hook guards save/discard/cancel/import, preserves failed batch and retries atomically',async()=>{
 const config={newDraft:newFaction,toForm:toFactionForm,fromForm:fromFactionForm,duplicate:duplicateFaction,parse:parseFactionJson,importBytes:FACTION_LIMITS.importBytes,channel:FACTION_CHANNEL,event:FACTION_LIBRARY_UPDATED};let hook!:ReturnType<typeof useLibraryEditor<FactionDraft,FactionDefinition,FactionForm>>;let fail=true;const repo={...repository,saveMany:async(...args:Parameters<typeof repository.saveMany>)=>{if(fail)throw new Error('storage failed');return repository.saveMany(...args);}};
 function Harness(){hook=useLibraryEditor(repo,config);return null;}
 const close=await mount(createElement(Harness));await settle(()=>hook.ready);
 try{await act(async()=>hook.changeForm((f)=>({...f,theme:{...f.theme,name:'保存前'}})));await act(async()=>hook.create());assert.ok(hook.pending);await act(async()=>hook.resolvePending('cancel'));assert.equal(hook.pending,null);await act(async()=>hook.create());await act(async()=>hook.resolvePending('save'));assert.equal((await repository.list()).length,1);const values=[factionFixture('incoming')];await act(async()=>hook.readImport({size:100,text:async()=>JSON.stringify(buildFactionExport(values))} as File));assert.equal(hook.incoming?.length,1);await act(async()=>hook.importItems('skip'));assert.equal(hook.incoming?.length,1);fail=false;await act(async()=>hook.importItems('skip'));assert.equal(hook.incoming,null);assert.ok(await repository.get('incoming'));
 }finally{await close();}
});
test('main Faction UI registers same definition twice, guards drafts and confirms bulk/delete with one Undo',async()=>{
 await repository.saveMany([factionFixture()],'skip');let closed=false;const close=await mount(createElement(DungeonFactionPanel,{close:()=>{closed=true;}}));await settle(()=>field('登録する勢力定義').options.length===2);
 try{await select('登録する勢力定義',factionFixture().id);await click('勢力を登録');await click('勢力を登録');assert.equal(state().dungeon.factions.length,5);await input('勢力個別名称','独立した分派');assert.equal(button('勢力設定を閉じる').disabled,true);assert.equal(button('勢力を登録').matches(':disabled'),true);await click('勢力情報を適用');assert.equal(state().dungeon.factions.at(-1)!.customName,'独立した分派');await click('勢力を複製');assert.equal(state().dungeon.factions.length,6);assert.equal(state().dungeon.roomFactionAssignments.length,2);
 await act(async()=>field('部屋01を一括設定').click());await click('一括支配設定を確認');assert.equal(state().dungeon.roomFactionAssignments[0].controllingFactionId,'FACTION_PRIVATE_INSTANCE_A');await click('キャンセル');await click('一括支配設定を確認');const history=state().undoStack.length;await click('勢力変更を確定');assert.equal(state().undoStack.length,history+1);const id=state().dungeon.factions[4].id;assert.equal(state().dungeon.roomFactionAssignments.find(a=>a.roomId==='room-0')!.controllingFactionId,id);await click('勢力を削除');await click('勢力変更を確定');assert.equal(state().dungeon.factions.length,5);assert.equal(state().dungeon.rooms.length,2);assert.equal(state().dungeon.entities.length,2);await act(async()=>state().undo());assert.equal(state().dungeon.factions.length,6);await click('勢力設定を閉じる');assert.equal(closed,true);
 }finally{await close();}
});
test('room panel edits contested versus controlled state and keeps membership independent',async()=>{
 const close=await mount(createElement(RoomFactionPanel,{roomId:'room-0'}));try{await select('支配状態','contested');const checks=[...doc.querySelectorAll<HTMLInputElement>('fieldset input')];await act(async()=>{checks[0].click();checks[1].click();});await input('現在の用途','交渉の場');await click('支配設定を適用');assert.equal(state().dungeon.roomFactionAssignments.find(a=>a.roomId==='room-0')!.status,'contested');assert.equal(state().dungeon.entities[0].factionId,'FACTION_PRIVATE_INSTANCE_A');await select('支配状態','controlled');await click('支配設定を適用');assert.ok(doc.querySelector('[role="alert"]'));assert.equal(state().dungeon.roomFactionAssignments.find(a=>a.roomId==='room-0')!.status,'contested');}finally{await close();}
});

test('late asynchronous Faction reads never register into another dungeon or after panel unmount',async()=>{
 await repository.saveMany([factionFixture()],'skip');let finish!:(f:ReturnType<typeof factionFixture>)=>void;
 const repo={...repository,get:()=>new Promise<ReturnType<typeof factionFixture>>(r=>{finish=r;})};let close=await mount(createElement(DungeonFactionPanel,{repository:repo,close:()=>{}}));await settle(()=>field('登録する勢力定義').options.length===2);await select('登録する勢力定義',factionFixture().id);await click('勢力を登録');await act(async()=>state().newDungeon());await act(async()=>finish(factionFixture()));assert.equal(state().dungeon.factions.length,0);assert.match(doc.body.textContent!,/ダンジョンまたは勢力が変わりました/);await close();
 state().setDungeon(factionDungeon());close=await mount(createElement(DungeonFactionPanel,{repository:repo,close:()=>{}}));await settle(()=>field('登録する勢力定義').options.length===2);await select('登録する勢力定義',factionFixture().id);await click('勢力を登録');await close();await act(async()=>finish(factionFixture()));assert.equal(state().dungeon.factions.length,3);
});

test('relation drafts guard navigation/close, symmetric editing updates one row, and discard retains saved relation',async()=>{
 const close=await mount(createElement(DungeonFactionPanel,{close:()=>{}}));try{await click('● FACTION_PRIVATE_A');await select('関係の相手','FACTION_PRIVATE_INSTANCE_C');await select('勢力関係の種別','allied');await input('関係のGM情報','交渉済み');assert.equal(button('勢力設定を閉じる').disabled,true);await click('関係を保存');assert.equal(state().dungeon.factionRelations.length,2);await click('● FACTION_PRIVATE_C');assert.match(doc.body.textContent!,/同盟/);await click('関係を編集');await select('勢力関係の種別','rival');await click('関係を保存');assert.equal(state().dungeon.factionRelations.length,2);assert.equal(state().dungeon.factionRelations.find(r=>r.factionBId==='FACTION_PRIVATE_INSTANCE_C')!.kind,'rival');await click('関係を編集');await input('関係のGM情報','未保存');await click('関係の変更を破棄');assert.equal(button('勢力設定を閉じる').disabled,false);assert.equal(state().dungeon.factionRelations.find(r=>r.factionBId==='FACTION_PRIVATE_INSTANCE_C')!.gmNotes,'交渉済み');}finally{await close();}
});
