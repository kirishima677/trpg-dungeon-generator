import {useMemo} from 'react';
import {useEncounterLibrary} from './useEncounterLibrary';
import {LibraryPolicyEditor} from './LibraryPolicyEditor';
import type {PolicyForm} from '../../themes/themeForm';
import {fromEncounterPolicyForm} from '../../themes/themeForm';
import {resolveEncounterSelection} from '../../model/themeSelection';
export function EncounterSelectionEditor({policy,onChange}:{policy:PolicyForm;onChange:(p:Partial<PolicyForm>)=>void}) {
 const library=useEncounterLibrary(),result=useMemo(()=>{try{return {value:resolveEncounterSelection(fromEncounterPolicyForm(policy),library.themes),error:''};}catch(e){return {value:null,error:(e as Error).message};}},[policy,library.themes]);
 return <section aria-label="Encounter候補設定"><LibraryPolicyEditor label="Encounter" policy={policy} onChange={onChange} values={library.themes} /><button onClick={()=>void library.reload()}>Encounter一覧を再取得</button>{(library.error||result.error)&&<p role="alert">{library.error||result.error}</p>}<p>Encounter候補 {result.value?.candidates.length??0}件</p><ul>{result.value?.candidates.map(t=><li key={t.id}>{t.name} / {t.category}</li>)}</ul><ul>{result.value?.warnings.map((w,i)=><li key={i}>{w.message}</li>)}</ul></section>;
}
