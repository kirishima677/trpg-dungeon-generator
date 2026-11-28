import {useState} from 'react';
import type {PolicyForm} from '../../themes/themeForm';
import {policyList} from '../../themes/themeForm';
import {formatStringList} from '../../utils/stringList';
import {PolicyEditor} from '../themes/PolicyEditor';
import {SELECTION_LIMITS} from '../../model/themeSelection';
/** Read-only material selection, preserving unresolved IDs and independent form text. */
export function LibraryPolicyEditor({label,policy,onChange,values}:{label:string;policy:PolicyForm;onChange:(p:Partial<PolicyForm>)=>void;values:readonly {id:string;name:string;tags?:string[]}[]}) {
 const [picking,setPicking]=useState<'include'|'exclude'|null>(null),[chosen,setChosen]=useState<Set<string>>(new Set()),[query,setQuery]=useState(''),[error,setError]=useState('');
 const filtered=values.filter(v=>[v.name,v.id,...v.tags??[]].some(t=>t.toLowerCase().includes(query.toLowerCase()))),[page,setPage]=useState(0),actualPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/50)-1));
 return <><PolicyEditor label={label} policy={policy} onChange={onChange} openPicker={excluded=>{try{const field=excluded?'exclude':'include';setChosen(new Set(policyList(policy[field],true)));setPicking(field);setError('');}catch(e){setError((e as Error).message);}}} />{error&&<p role="alert">{error}</p>}
  {picking&&<div className="theme-modal"><section role="dialog" aria-modal="true" aria-label={`${label}参照選択`}><h3>{label}を選択</h3><p>素材自体は変更しません。選択済みの未解決IDも保持します。</p><label>検索<input aria-label={`${label}参照検索`} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} /></label>{filtered.slice(actualPage*50,(actualPage+1)*50).map(v=><label key={v.id}><input type="checkbox" aria-label={`${v.name}（${v.id}）を参照選択`} checked={chosen.has(v.id)} disabled={!chosen.has(v.id)&&chosen.size>=SELECTION_LIMITS.ids} onChange={e=>setChosen(old=>{const n=new Set(old);if(e.target.checked)n.add(v.id);else n.delete(v.id);return n;})} />{v.name}<small>{v.id}</small></label>)}<button disabled={!actualPage} onClick={()=>setPage(actualPage-1)}>前の参照</button><button disabled={(actualPage+1)*50>=filtered.length} onClick={()=>setPage(actualPage+1)}>次の参照</button><button onClick={()=>{onChange({[picking]:formatStringList([...chosen])});setPicking(null);}}>参照を反映</button><button onClick={()=>setPicking(null)}>キャンセル</button></section></div>}
 </>;
}
