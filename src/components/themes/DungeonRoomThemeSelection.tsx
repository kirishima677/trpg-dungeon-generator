import { useMemo, useState } from 'react';
import type { PolicyForm } from '../../themes/themeForm';
import { fromRoomThemePolicyForm, policyList } from '../../themes/themeForm';
import { formatStringList } from '../../utils/stringList';
import { resolveRoomThemeSelection } from '../../model/themeSelection';
import { useRoomThemeLibrary } from './useRoomThemeLibrary';
import { PolicyEditor } from './PolicyEditor';
import { searchThemes } from '../../themes/themeSearch';
import { SELECTION_LIMITS } from '../../model/themeSelection';

export function DungeonRoomThemeSelection({ policy, onChange }: { policy:PolicyForm; onChange:(patch:Partial<PolicyForm>) => void }) {
  const library = useRoomThemeLibrary(), [picking,setPicking] = useState<null|'include'|'exclude'>(null), [error,setError] = useState('');
  const [chosen,setChosen] = useState<Set<string>>(new Set()),[query,setQuery] = useState(''),[page,setPage] = useState(0);
  const result = useMemo(() => { try { return { value:resolveRoomThemeSelection(fromRoomThemePolicyForm(policy),library.themes),error:'' }; } catch(e) { return { value:null,error:(e as Error).message }; } },[policy,library.themes]);
  const values = searchThemes(picking ? library.themes : result.value?.candidates ?? [],query), actualPage = Math.min(page,Math.max(0,Math.ceil(values.length/50)-1));
  return <section aria-label="Dungeon ThemeのRoom Theme候補"><PolicyEditor label="Room Theme" policy={policy} onChange={onChange} openPicker={excluded => {
    try { const field=excluded?'exclude':'include';setChosen(new Set(policyList(policy[field],true)));setPicking(field);setPage(0);setError(''); } catch(e) { setError((e as Error).message); }
  }} />
    {(error || result.error || library.error) && <p role="alert">{error || result.error || library.error}</p>}
    <button onClick={() => void library.reload()}>Room Theme一覧を再取得</button><p>候補 {result.value?.candidates.length ?? 0}件</p>
    <label>Room Theme検索<input aria-label="Room Theme候補検索" value={query} onChange={e => { setQuery(e.target.value);setPage(0); }} /></label>
    <div className="theme-candidates">{!picking && values.slice(actualPage*50,(actualPage+1)*50).map(t => <article key={t.id}><strong>{t.name}</strong><p>{t.genre} / {t.category} / {t.purpose}</p><p>{t.summary}</p><small>{t.id} / {t.tags.join(', ')}</small></article>)}</div>
    {!picking && <><button disabled={!actualPage} onClick={() => setPage(actualPage-1)}>前のRoom Theme</button><button disabled={(actualPage+1)*50>=values.length} onClick={() => setPage(actualPage+1)}>次のRoom Theme</button></>}
    {result.value && <ul>{result.value.warnings.slice(0,100).map((w,i) => <li key={i}>{w.message}</li>)}</ul>}
    {picking && <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="Room Theme参照の選択"><h2>Room Themeを選択</h2><p>選択 {chosen.size}件 / 最大{SELECTION_LIMITS.ids}件。未解決IDも保持します。</p>
      <label>検索<input aria-label="参照Room Theme検索" value={query} onChange={e => { setQuery(e.target.value);setPage(0); }} /></label>
      <div className="theme-candidates">{values.slice(actualPage*50,(actualPage+1)*50).map(t => <label key={t.id}><input type="checkbox" aria-label={`${t.name}（${t.id}）をRoom Theme候補に選択`} checked={chosen.has(t.id)} disabled={!chosen.has(t.id)&&chosen.size>=SELECTION_LIMITS.ids} onChange={e => setChosen(old => { const next=new Set(old);if(e.target.checked)next.add(t.id);else next.delete(t.id);return next; })} />{t.name} / {t.purpose}<small>{t.id}</small></label>)}</div>
      <button disabled={!actualPage} onClick={() => setPage(actualPage-1)}>前のRoom Theme</button><button disabled={(actualPage+1)*50>=values.length} onClick={() => setPage(actualPage+1)}>次のRoom Theme</button>
      <button onClick={() => {onChange({[picking]:formatStringList([...chosen])});setPicking(null);}}>Room Theme選択を反映</button><button onClick={() => setPicking(null)}>キャンセル</button>
    </section></div>}
  </section>;
}
