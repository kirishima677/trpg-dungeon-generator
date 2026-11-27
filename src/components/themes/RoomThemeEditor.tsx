import { useMemo,useState } from 'react';
import { useRoomThemeEditor } from './useRoomThemeEditor';
import { useThemeMaterials } from './useThemeMaterials';
import type { ThemeMaterialRepositories } from './useThemeMaterials';
import type { RoomThemeRepository } from '../../repository/roomThemeRepository';
import { useThemeLibrary } from './useThemeLibrary';
import { fromRoomThemeForm } from '../../themes/roomThemeForm';
import { buildRoomThemeExport,roomThemeFilename } from '../../themes/roomThemeJson';
import { downloadJson } from '../../utils/exportImport';
import { ThemeEditorWorkbench } from './ThemeEditorWorkbench';
import { RequiredContentsEditor,RoomConstraintsEditor } from './RoomThemeFields';
import { RoomThemePreview } from './RoomThemePreview';
import { ROOM_THEME_LIMITS } from '../../model/roomTheme';

export function RoomThemeEditor({repository,materials,download=downloadJson}:{repository?:RoomThemeRepository;materials?:ThemeMaterialRepositories;download?:typeof downloadJson}) {
  const editor=useRoomThemeEditor(repository),library=useThemeMaterials(materials),dungeons=useThemeLibrary(),[dungeonId,setDungeonId]=useState('');
  const form=editor.entry.form,validated=useMemo(()=>{try{return {value:fromRoomThemeForm(form),error:''};}catch(e){return {value:null,error:(e as Error).message};}},[form]);
  const preview=useMemo(()=>{try{return {value:fromRoomThemeForm({...form,theme:{...form.theme,name:form.theme.name.trim()||'未命名'}}),error:''};}catch(e){return {value:null,error:(e as Error).message};}},[form]);
  const change=(next:typeof form)=>editor.changeForm(()=>next);
  const dungeon=dungeons.themes.find(t=>t.id===dungeonId);
  return <ThemeEditorWorkbench editor={editor} library={library} title="Room Theme管理" validError={validated.error} buildExport={buildRoomThemeExport} filename={roomThemeFilename} download={download} libraryName="room-theme-library"
    extraFields={<label>部屋の用途<input aria-label="部屋の用途" maxLength={ROOM_THEME_LIMITS.purpose} value={form.theme.purpose} onChange={e=>editor.changeForm(f=>({...f,theme:{...f.theme,purpose:e.target.value}}))} /></label>}
    extraTabs={[{id:'constraints',title:'構造条件',content:<RoomConstraintsEditor form={form} change={change} />},{id:'required',title:'必須Content',content:<RequiredContentsEditor form={form} change={change} {...library} />} ]}
    preview={<>{dungeons.error&&<p role="alert">{dungeons.error}</p>}<label>統合するDungeon Theme<select aria-label="統合Dungeon Theme" value={dungeonId} onChange={e=>setDungeonId(e.target.value)}><option value="">Dungeon Themeなし</option>{dungeons.themes.map(t=><option key={t.id} value={t.id}>{t.name} / {t.id}</option>)}</select></label>
      {dungeonId&&!dungeon&&<p>指定したDungeon Themeは現在のライブラリにありません。単体候補を表示します。</p>}
      {!library.ready?<p>素材を読み込んでいます…</p>:preview.value?<RoomThemePreview roomTheme={preview.value} dungeonTheme={dungeon} pieces={library.pieces} contents={library.contents} />:<p role="alert">{preview.error}</p>}</>} />;
}
