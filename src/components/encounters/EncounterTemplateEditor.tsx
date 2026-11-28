import {useMemo,useState} from 'react';
import {useLibraryEditor} from '../library/useLibraryEditor';
import {encounterRepository} from '../../repository/encounterRepository';
import type {EncounterRepository} from '../../repository/encounterRepository';
import {newEncounterTemplate,duplicateEncounterTemplate,ENCOUNTER_LIMITS} from '../../model/encounter/template';
import {toEncounterForm,fromEncounterForm} from '../../encounters/encounterForm';
import {buildEncounterExport,parseEncounterJson,encounterFilename} from '../../encounters/encounterJson';
import {ENCOUNTER_CHANNEL,ENCOUNTER_LIBRARY_UPDATED} from '../../encounters/encounterEvents';
import {ThemeEditorWorkbench} from '../themes/ThemeEditorWorkbench';
import {useThemeMaterials} from '../themes/useThemeMaterials';
import type {ThemeMaterialRepositories} from '../themes/useThemeMaterials';
import type {downloadJson} from '../../utils/exportImport';
import {ContentMarkdown} from '../content/ContentFields';
import {EncounterApplicabilityFields,EncounterRoleFields,EncounterEntryFields} from './EncounterTemplateFields';
import {EncounterTemplatePreview} from './EncounterTemplatePreview';
const config={newDraft:newEncounterTemplate,toForm:toEncounterForm,fromForm:fromEncounterForm,duplicate:duplicateEncounterTemplate,parse:parseEncounterJson,importBytes:ENCOUNTER_LIMITS.importBytes,channel:ENCOUNTER_CHANNEL,event:ENCOUNTER_LIBRARY_UPDATED};
export function EncounterTemplateEditor({repository=encounterRepository,materials,download}:{repository?:EncounterRepository;materials?:ThemeMaterialRepositories;download?:typeof downloadJson}) {
 const editor=useLibraryEditor(repository,config),library=useThemeMaterials(materials),form=editor.entry.form,change=(next:typeof form)=>editor.changeForm(()=>next),[story,setStory]=useState<'situation'|'objectives'|'publicDescription'>('situation');
 const valid=useMemo(()=>{try{return {value:fromEncounterForm(form),error:''};}catch(e){return {value:null,error:(e as Error).message.replaceAll('テーマ','Encounter')};}},[form]);
 const preview=useMemo(()=>{try{return fromEncounterForm({...form,theme:{...form.theme,name:form.theme.name.trim()||'未命名'}});}catch{return null;}},[form]);
 return <ThemeEditorWorkbench editor={editor} library={library} title="Encounter Template管理" noun="Encounter" includePiece={false} includeContent={false} includeEncounters={false} validError={valid.error} buildExport={buildEncounterExport} filename={encounterFilename} download={download} libraryName="encounter-template-library"
 itemSummary={t=><p>必須 {t.entries.filter(e=>e.required).length} / 任意 {t.entries.filter(e=>!e.required).length} / Role {t.factionRoles.length}</p>}
 extraTabs={[{id:'story',title:'状況・目的・公開説明',content:<><label>記述対象<select aria-label="Encounter記述対象" value={story} onChange={e=>setStory(e.target.value as typeof story)}><option value="situation">状況</option><option value="objectives">目的</option><option value="publicDescription">公開説明の初期値</option></select></label><ContentMarkdown description={form.theme[story]} gmNotes={form.theme.gmNotes} descriptionLabel={story==='situation'?'状況':story==='objectives'?'目的':'公開説明の初期値'} notesLabel="Encounter GM情報" maxLength={story==='publicDescription'?20000:100000} onChange={(field,value)=>editor.changeForm(f=>({...f,theme:{...f.theme,[field==='description'?story:'gmNotes']:value}}))} /></>},
 {id:'applicability',title:'適用条件',content:<EncounterApplicabilityFields form={form} change={change} />},
 {id:'roles',title:'参加勢力・関係',content:<EncounterRoleFields form={form} change={change} />},
 {id:'entries',title:'構成要素',content:<EncounterEntryFields form={form} change={change} contents={library.contents} />} ]}
 preview={preview?<EncounterTemplatePreview draft={preview} contents={library.contents} />:<p>入力内容を確認してください。</p>} />;
}
