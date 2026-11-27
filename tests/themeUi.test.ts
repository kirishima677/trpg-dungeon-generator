import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import type { ThemeRepository } from '../src/repository/themeRepository';
import { themeFixture } from './fixtures/themeFixture';
import { contentFixture, entityDungeon } from './fixtures/entityFixture';
import { CONTENT_KINDS } from '../src/model/content';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';
import { buildThemeExport } from '../src/themes/themeJson';
import { THEME_CHANNEL, THEME_LIBRARY_UPDATED } from '../src/themes/themeEvents';
import { CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED } from '../src/content/contentEvents';
import { PIECE_CHANNEL, PIECE_LIBRARY_UPDATED } from '../src/editor/pieces/pieceEvents';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/?themeEditor=1'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
class Channel{
  static instances=new Set<Channel>();onmessage:((event:{data:unknown})=>void)|null=null;
  constructor(readonly name:string){Channel.instances.add(this);}
  postMessage(data:unknown){for(const c of Channel.instances)if(c!==this&&c.name===this.name)c.onmessage?.({data});}
  close(){Channel.instances.delete(this);}
}
Object.assign(globalThis,{BroadcastChannel:Channel});
const {act,createElement}=await import('react');const {createRoot}=await import('react-dom/client');
const {db}=await import('../src/db/db');const {createThemeRepository}=await import('../src/repository/themeRepository');
const {useThemeEditor}=await import('../src/components/themes/useThemeEditor');const {ThemeEditor}=await import('../src/components/themes/ThemeEditor');
const {DungeonThemePanel}=await import('../src/components/themes/DungeonThemePanel');const {useDungeonStore}=await import('../src/store/dungeonStore');
const repository=createThemeRepository(),doc=dom.window.document,state=()=>useDungeonStore.getState();
let customPieces=[{...DEFAULT_PIECES[0],id:'custom-theme',name:'礼拝堂',tags:['地下']}],contents=CONTENT_KINDS.map(k=>contentFixture(k)),pieceReads=0,contentReads=0;
const materials={pieces:{list:async()=>{pieceReads++;return structuredClone(customPieces);}},contents:{list:async()=>{contentReads++;return structuredClone(contents);}}};
beforeEach(async()=>{await db.dungeonThemes.clear();state().setDungeon(entityDungeon());customPieces=[{...DEFAULT_PIECES[0],id:'custom-theme',name:'礼拝堂',tags:['地下']}];contents=CONTENT_KINDS.map(k=>contentFixture(k));pieceReads=0;contentReads=0;});
after(async()=>{await db.delete();dom.window.close();});
async function settle(test:()=>boolean){for(let i=0;i<120&&!test();i++)await act(async()=>{await new Promise(r=>setTimeout(r,2));});assert.ok(test(),'state did not settle');}
async function harness(repo:ThemeRepository=repository){let api!:ReturnType<typeof useThemeEditor>;function Harness(){api=useThemeEditor(repo);return null;}const el=doc.createElement('div');doc.body.append(el);const root=createRoot(el);await act(async()=>root.render(createElement(Harness)));await settle(()=>api.ready||!!api.error);return{get api(){return api;},close:async()=>{await act(async()=>root.unmount());el.remove();}};}
const button=(name:string)=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(b,name);return b;};
const click=(name:string)=>act(async()=>{button(name).click();await new Promise(r=>setTimeout(r,5));});
const field=(name:string)=>{const el=doc.querySelector(`[aria-label="${name}"]`);assert.ok(el,name);return el as HTMLInputElement&HTMLSelectElement&HTMLTextAreaElement;};
const input=(name:string,value:string)=>act(async()=>{const el=field(name),proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
const select=(name:string,value:string)=>act(async()=>{const el=field(name);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
const patch=(api:ReturnType<typeof useThemeEditor>,name:string)=>api.changeForm(f=>({...f,theme:{...f.theme,name}}));
async function mountEditor(download:typeof import('../src/utils/exportImport').downloadJson=()=>{}){const root=createRoot(doc.getElementById('root')!);await act(async()=>root.render(createElement(ThemeEditor,{repository,materials,download})));await settle(()=>!button('Export JSON').disabled);return()=>act(async()=>root.unmount());}
async function notify(channel:string,type:string){const c=new Channel(channel);await act(async()=>c.postMessage({type}));c.close();}
test('theme dirty guards preserve drafts through cancel and failed save, then save/discard/duplicate/import transitions work',async()=>{
  await repository.saveMany([themeFixture()],'skip');let fail=true;
  const ui=await harness({...repository,save:async(...args)=>{if(fail)throw new Error('容量不足');return repository.save(...args);}});
  try{assert.equal(ui.api.dirty,false);assert.equal((await repository.list()).length,1);await act(async()=>patch(ui.api,'新規'));const event=new dom.window.Event('beforeunload',{cancelable:true});dom.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
    await act(async()=>ui.api.select(themeFixture().id));await act(async()=>ui.api.resolvePending('cancel'));assert.equal(ui.api.entry.form.theme.name,'新規');
    await act(async()=>ui.api.select(themeFixture().id));await act(async()=>ui.api.resolvePending('save'));assert.match(ui.api.error,/容量不足/);assert.ok(ui.api.pending);assert.equal(ui.api.dirty,true);
    fail=false;await act(async()=>ui.api.resolvePending('save'));assert.equal(ui.api.entry.form.theme.id,themeFixture().id);assert.equal((await repository.list()).length,2);
    await act(async()=>patch(ui.api,'破棄対象'));await act(async()=>ui.api.create());await act(async()=>ui.api.resolvePending('discard'));assert.equal(ui.api.entry.form.theme.name,'');
    await act(async()=>ui.api.select(themeFixture().id));await settle(()=>!!ui.api.entry.baseline);await act(async()=>ui.api.duplicate());await settle(()=>ui.api.dirty);assert.notEqual(ui.api.entry.form.theme.id,themeFixture().id);assert.equal(ui.api.entry.baseline,null);
    let opened=false;await act(async()=>ui.api.request(()=>{opened=true;}));assert.equal(opened,false);await act(async()=>ui.api.resolvePending('cancel'));assert.equal(opened,false);
  }finally{await ui.close();}
});
test('theme windows refresh clean drafts but retain dirty edits and reject stale save/delete',async()=>{
  await repository.saveMany([themeFixture()],'skip');const one=await harness(),two=await harness();
  try{await act(async()=>one.api.select(themeFixture().id));await act(async()=>two.api.select(themeFixture().id));await settle(()=>!!one.api.entry.baseline&&!!two.api.entry.baseline);
    await act(async()=>patch(one.api,'更新1'));await act(async()=>one.api.save());await settle(()=>two.api.entry.form.theme.name==='更新1');
    await act(async()=>patch(two.api,'未保存'));await act(async()=>patch(one.api,'更新2'));await act(async()=>one.api.save());await settle(()=>two.api.items.some(t=>t.name==='更新2'));
    assert.equal(two.api.entry.form.theme.name,'未保存');assert.match(two.api.notice,/保持/);await act(async()=>two.api.save());assert.match(two.api.error,/別ウィンドウ/);await act(async()=>two.api.deleteCurrent());assert.match(two.api.error,/別ウィンドウ/);
  }finally{await one.close();await two.close();}assert.equal([...Channel.instances].filter(c=>c.name===THEME_CHANNEL).length,0);
});
test('theme import failure retains validated batch for retry and reports collision counts; list failure is recoverable',async()=>{
  await repository.saveMany([themeFixture()],'skip');let fail=true,listFail=true;
  const ui=await harness({...repository,list:async()=>{if(listFail)throw new Error('一覧失敗');return repository.list();},saveMany:async(...args)=>{if(fail)throw new Error('Import失敗');return repository.saveMany(...args);}});
  const file=(text:string)=>({size:new TextEncoder().encode(text).length,text:async()=>text}) as File;
  try{assert.equal(ui.api.ready,false);await act(async()=>patch(ui.api,'保持'));listFail=false;await act(async()=>ui.api.retry());assert.equal(ui.api.entry.form.theme.name,'保持');
    await act(async()=>ui.api.readImport(file('{')));assert.equal(ui.api.incoming,null);assert.match(ui.api.error,/構文/);
    await act(async()=>ui.api.readImport(file(JSON.stringify(buildThemeExport([{...themeFixture(),name:'別定義'},themeFixture('new')])))));await act(async()=>ui.api.importItems('new-id'));assert.match(ui.api.error,/Import失敗/);assert.equal(ui.api.incoming?.length,2);
    fail=false;await act(async()=>ui.api.importItems('new-id'));assert.equal(ui.api.incoming,null);assert.match(ui.api.notice,/新規登録 2件.*新規ID発行 1件/);assert.equal(ui.api.entry.form.theme.name,'保持');
  }finally{await ui.close();}
});
test('actual theme editor preserves disabled policy fields and all six independent kinds, with shared Resolver warnings',async()=>{
  const close=await mountEditor();try{await input('テーマ名称','地下神殿');await input('ジャンル','独自SF');await input('施設分類','独自施設');await input('テーマタグ',' 地下,地下, SF');
    await click('Piece候補');await select('Piece選択モード','filtered');await input('Piece必須タグ','地下');await input('Piece明示ID','missing');
    await select('Piece選択モード','all');assert.equal(field('Piece必須タグ').disabled,true);assert.equal(field('Piece明示ID').disabled,true);assert.equal(field('Piece必須タグ').value,'地下');
    await select('Piece選択モード','filtered');assert.equal(field('Piece必須タグ').value,'地下');
    await click('Content候補');for(const [index,kind]of CONTENT_KINDS.entries()){const label=['Monster','Treasure','Trap','Object','NPC','Event'][index];await click(label);await select(`${label}選択モード`,'explicit');await input(`${label}明示ID`,contentFixture(kind).id);}
    await click('候補プレビュー');await settle(()=>doc.body.textContent!.includes('Piece (1)'));for(const label of ['Monster','Treasure','Trap','Object','NPC','Event'])assert.ok(button(`${label} (1)`));assert.match(doc.body.textContent!,/missing.*見つかりません/);
    const reads=[pieceReads,contentReads];await click('基本情報');await input('テーマ概要','試験');assert.deepEqual([pieceReads,contentReads],reads);
    await click('保存');await settle(()=>doc.body.textContent!.includes('保存しました。'));const t=(await repository.list())[0];assert.deepEqual(t.tags,['地下','SF']);assert.equal(t.genre,'独自SF');
    for(const kind of CONTENT_KINDS)assert.deepEqual(t.contentSelection[kind].includeContentIds,[contentFixture(kind).id]);assert.deepEqual(t.pieceSelection.includePieceIds,['missing']);
  }finally{await close();}
});
test('material picker is read-only, preserves unresolved IDs and updates exact policy without saving materials',async()=>{
  const close=await mountEditor();try{await input('テーマ名称','参照テーマ');await click('Piece候補');await select('Piece選択モード','explicit');await input('Piece明示ID','unknown');await click('Piece Libraryから明示指定');
    assert.ok(field('テーマ素材の選択'));await input('テーマ素材検索','礼拝堂');await act(async()=>field('礼拝堂（custom-theme）をテーマ候補に選択').click());await click('選択を反映');
    assert.match(field('Piece明示ID').value,/unknown/);assert.match(field('Piece明示ID').value,/custom-theme/);assert.equal(await db.pieceLibrary.count(),0);assert.equal(await db.contentDefinitions.count(),0);
    await click('保存');await settle(()=>doc.body.textContent!.includes('保存しました。'));assert.deepEqual((await repository.list())[0].pieceSelection.includePieceIds,['unknown','custom-theme']);
  }finally{await close();}
});
test('live candidate previews reload only notified material libraries and retain the unsaved theme',async()=>{
  const close=await mountEditor();try{await input('テーマ名称','未保存');await click('Piece候補');await select('Piece選択モード','filtered');await input('Piece必須タグ','地下');await click('Content候補');await select('Monster選択モード','all');await click('候補プレビュー');await settle(()=>doc.body.textContent!.includes('Piece (1)'));
    const contentBefore=contentReads;customPieces=[];await notify(PIECE_CHANNEL,PIECE_LIBRARY_UPDATED);await settle(()=>doc.body.textContent!.includes('Piece (0)'));assert.equal(contentReads,contentBefore);
    const pieceBefore=pieceReads;contents=[];await notify(CONTENT_CHANNEL,CONTENT_LIBRARY_UPDATED);await settle(()=>doc.body.textContent!.includes('Monster (0)'));assert.equal(pieceReads,pieceBefore);assert.equal(field('テーマ名称').value,'未保存');assert.equal(await db.dungeonThemes.count(),0);
  }finally{await close();}
});
test('theme Markdown is sanitized; exports current/checked/filtered/all saved themes and paginates without losing hidden selections',async()=>{
  const themes=Array.from({length:61},(_,n)=>({...themeFixture(`id-${n}`),name:`テーマ${String(n).padStart(2,'0')}`,genre:n%2?'fantasy':'SF',category:'castle'}));await repository.saveMany(themes,'skip');
  const output:unknown[]=[],close=await mountEditor(value=>{output.push(value);});try{assert.equal(doc.querySelectorAll('aside article').length,50);await act(async()=>doc.querySelector<HTMLInputElement>('aside article input')!.click());await click('次の50件');assert.equal(doc.querySelectorAll('aside article').length,11);
    await input('テーマ検索','テーマ60');await act(async()=>doc.querySelector<HTMLButtonElement>('aside .content-item')!.click());await settle(()=>field('テーマ名称').value==='テーマ60');await click('Export JSON');await settle(()=>output.length===1);assert.equal((output[0]as{type:string}).type,'dungeon-theme');
    await select('テーマの出力対象','selected');await click('Export JSON');await select('テーマの出力対象','filtered');await click('Export JSON');await select('テーマの出力対象','all');await click('Export JSON');await settle(()=>output.length===4);
    assert.equal((output[1]as{themes:unknown[]}).themes.length,1);assert.equal((output[2]as{themes:unknown[]}).themes.length,1);assert.equal((output[3]as{themes:unknown[]}).themes.length,61);
    await click('Markdown');await input('テーマ詳細（Markdown）','## 見出し\n**強調**<script>alert(1)</script><img src=x onerror=alert(1)>[危険](javascript:alert(1))');const preview=field('テーマ詳細のプレビュー');assert.ok(preview.querySelector('h2'));assert.ok(preview.querySelector('strong'));assert.equal(preview.querySelector('script,img,[onerror],a[href^="javascript:"]'),null);
    await click('テーマGM情報');await input('テーマGM情報（Markdown）','## SECRET');await click('保存');await settle(()=>doc.body.textContent!.includes('保存しました。'));assert.equal((await repository.get('id-60'))!.gmNotes,'## SECRET');
    await input('テーマ検索','');await select('ジャンル絞り込み','SF');assert.equal(doc.querySelectorAll('aside article').length,31);await click('削除');assert.ok(field('テーマの削除確認'));await click('キャンセル');assert.equal(await db.dungeonThemes.count(),61);await click('削除');await click('削除を確定');await settle(()=>doc.body.textContent!.includes('削除しました。'));assert.equal(await db.dungeonThemes.count(),60);
  }finally{await close();}
});
async function mountPanel(repo:ThemeRepository=repository){const root=createRoot(doc.getElementById('root')!);await act(async()=>root.render(createElement(DungeonThemePanel,{close:()=>{},repository:repo,materials})));await settle(()=>!!doc.querySelector('input[type=radio]'));return()=>act(async()=>root.unmount());}
test('actual assignment panel applies snapshots, confirms explicit refresh, clears and supports Undo after source deletion',async()=>{
  await repository.saveMany([themeFixture()],'skip');const close=await mountPanel();try{await act(async()=>field(`${themeFixture().name}（${themeFixture().id}）を適用選択`).click());await click('選択したテーマを適用');await settle(()=>!!state().dungeon.theme);assert.equal(state().dungeon.theme!.themeSnapshot.name,themeFixture().name);
    await act(async()=>{await repository.save({...themeFixture(),name:'最新版'},themeFixture().updatedAt);});await settle(()=>doc.body.textContent!.includes('別の更新版'));assert.equal(state().dungeon.theme!.themeSnapshot.name,themeFixture().name);
    await click('テーマの最新版を反映');assert.ok(field('テーマ更新の確認'));await click('キャンセル');assert.equal(state().dungeon.theme!.themeSnapshot.name,themeFixture().name);
    await click('テーマの最新版を反映');await click('テーマ更新を確定');await settle(()=>state().dungeon.theme!.themeSnapshot.name==='最新版');
    const latest=(await repository.get(themeFixture().id))!;await act(async()=>repository.delete(latest.id,latest.updatedAt));await settle(()=>button('テーマの最新版を反映').disabled);assert.equal(state().dungeon.theme!.themeSnapshot.name,'最新版');
    await click('テーマ解除');assert.equal(state().dungeon.theme,undefined);await act(async()=>state().undo());assert.equal(state().dungeon.theme!.themeSnapshot.name,'最新版');assert.equal(button('テーマの最新版を反映').disabled,true);
  }finally{await close();}
});
test('late asynchronous theme reads never apply to a different dungeon or after closing the panel',async()=>{
  await repository.saveMany([themeFixture()],'skip');let finish!:(value:ReturnType<typeof themeFixture>)=>void;const repo={...repository,get:()=>new Promise<ReturnType<typeof themeFixture>>(resolve=>{finish=resolve;})};
  let close=await mountPanel(repo);await act(async()=>field(`${themeFixture().name}（${themeFixture().id}）を適用選択`).click());await click('選択したテーマを適用');await act(async()=>state().setDungeon({...entityDungeon(),id:'different'}));await act(async()=>finish(themeFixture()));assert.equal(state().dungeon.theme,undefined);assert.match(doc.body.textContent!,/変わりました/);await close();
  close=await mountPanel(repo);await act(async()=>field(`${themeFixture().name}（${themeFixture().id}）を適用選択`).click());await click('選択したテーマを適用');await close();await act(async()=>finish(themeFixture()));assert.equal(state().dungeon.theme,undefined);
});
test('external theme deletion preserves dirty editing and focus refresh recovers a missed notification',async()=>{
  await repository.saveMany([themeFixture()],'skip');const ui=await harness();try{await act(async()=>ui.api.select(themeFixture().id));await settle(()=>!!ui.api.entry.baseline);await act(async()=>patch(ui.api,'未保存維持'));const silent=createThemeRepository(db,()=>{});await silent.delete(themeFixture().id,themeFixture().updatedAt);await act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await settle(()=>ui.api.items.length===0);assert.equal(ui.api.entry.form.theme.name,'未保存維持');assert.match(ui.api.notice,/保持/);
    await act(async()=>ui.api.create());await act(async()=>ui.api.resolvePending('discard'));assert.equal(ui.api.entry.baseline,null);await notify(THEME_CHANNEL,THEME_LIBRARY_UPDATED);assert.equal(ui.api.entry.form.theme.name,'');
  }finally{await ui.close();}
});
