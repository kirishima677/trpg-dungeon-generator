import { useMemo,useState } from 'react';
import { useLibraryEditor } from '../library/useLibraryEditor';
import { newFaction,duplicateFaction,FACTION_LIMITS } from '../../model/faction';
import { fromFactionForm,toFactionForm } from '../../factions/factionForm';
import { parseFactionJson,buildFactionExport,factionFilename } from '../../factions/factionJson';
import { FACTION_CHANNEL,FACTION_LIBRARY_UPDATED } from '../../factions/factionEvents';
import { factionRepository } from '../../repository/factionRepository';
import type { FactionRepository } from '../../repository/factionRepository';
import { ThemeEditorWorkbench } from '../themes/ThemeEditorWorkbench';
import { useThemeMaterials } from '../themes/useThemeMaterials';
import type { ThemeMaterialRepositories } from '../themes/useThemeMaterials';
import { useThemeLibrary } from '../themes/useThemeLibrary';
import { useRoomThemeLibrary } from '../themes/useRoomThemeLibrary';
import { DungeonRoomThemeSelection } from '../themes/DungeonRoomThemeSelection';
import { resolveFaction } from '../../model/factionResolver';
import { ContentMarkdown } from '../content/ContentFields';
import type { downloadJson } from '../../utils/exportImport';
const config={newDraft:newFaction,toForm:toFactionForm,fromForm:fromFactionForm,duplicate:duplicateFaction,parse:parseFactionJson,importBytes:FACTION_LIMITS.importBytes,channel:FACTION_CHANNEL,event:FACTION_LIBRARY_UPDATED};
export function FactionEditor({repository=factionRepository,materials,download}:{repository?:FactionRepository;materials?:ThemeMaterialRepositories;download?:typeof downloadJson}) {
  const editor=useLibraryEditor(repository,config),library=useThemeMaterials(materials),dungeons=useThemeLibrary(),rooms=useRoomThemeLibrary();
  const [dungeonId,setDungeonId]=useState(''),[roomId,setRoomId]=useState('');
  const form=editor.entry.form;
  const valid=useMemo(()=>{try{return {value:fromFactionForm(form),error:''};}catch(e){return {value:null,error:(e as Error).message.replaceAll('テーマ','勢力')};}},[form]);
  const result=useMemo(()=>{try{return resolveFaction(fromFactionForm({...form,theme:{...form.theme,name:form.theme.name.trim()||'未命名'}}),library.contents,rooms.themes,dungeons.themes.find(t=>t.id===dungeonId),rooms.themes.find(t=>t.id===roomId));}catch{return null;}},[form,library.contents,rooms.themes,dungeons.themes,dungeonId,roomId]);
  return <ThemeEditorWorkbench editor={editor} library={library} title="Faction管理" noun="勢力" includePiece={false} contentKinds={['monster','npc']} validError={valid.error} buildExport={buildFactionExport} filename={factionFilename} download={download} libraryName="faction-library"
    extraTabs={[{id:'objectives',title:'目的・行動方針',content:<ContentMarkdown description={form.theme.objectives} gmNotes={form.theme.behavior} descriptionLabel="目的" notesLabel="行動方針" onChange={(field,value)=>editor.changeForm(f=>({...f,theme:{...f.theme,[field==='description'?'objectives':'behavior']:value}}))} />},
      {id:'rooms',title:'推奨Room Theme',content:<DungeonRoomThemeSelection policy={form.roomThemes} onChange={patch=>editor.changeForm(f=>({...f,roomThemes:{...f.roomThemes,...patch}}))} />}]}
    preview={<><p>構成候補と実際の所属・支配は別々に管理します。</p>{[dungeons.error,rooms.error].filter(Boolean).map(e=><p key={e} role="alert">{e}</p>)}
      <label>統合Dungeon Theme<select aria-label="統合Dungeon Theme" value={dungeonId} onChange={e=>setDungeonId(e.target.value)}><option value="">なし</option>{dungeons.themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>統合Room Theme<select aria-label="統合Room Theme" value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">なし</option>{rooms.themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {result?<>{(['monster','npc'] as const).map(k=><section key={k}><h3>{k}: {result.members[k].length}件</h3><ul>{result.members[k].map(c=><li key={c.id}>{c.name} / {c.id}</li>)}</ul></section>)}<h3>Room Theme: {result.roomThemes.length}件</h3><ul>{result.roomThemes.map(t=><li key={t.id}>{t.name} / {t.id}</li>)}</ul><ul>{result.warnings.slice(0,100).map(w=><li key={w}>{w}</li>)}</ul></>:<p>入力内容を確認してください。</p>}</>} />;
}
