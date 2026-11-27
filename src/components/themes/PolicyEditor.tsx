import { useMemo, useState } from 'react';
import type { PolicyForm } from '../../themes/themeForm';
import { CONTENT_LABELS } from '../../model/content';
import type { ContentDefinition, ContentKind } from '../../model/content';
import type { Piece } from '../../model/types';
import { searchContents } from '../../content/contentSearch';
import { formatStringList, parseStringList } from '../../utils/stringList';
import { SELECTION_LIMITS } from '../../model/themeSelection';

export function PolicyEditor({ label, policy, onChange, openPicker }: {
  label: string; policy: PolicyForm; onChange: (patch: Partial<PolicyForm>) => void; openPicker: (excluded: boolean) => void;
}) {
  const positive = policy.mode === 'filtered', include = positive || policy.mode === 'explicit', active = policy.mode !== 'none';
  return <section aria-label={`${label}選択方針`}><h2>{label}選択方針</h2>
    <label>選択モード<select aria-label={`${label}選択モード`} value={policy.mode} onChange={e => onChange({ mode: e.target.value as PolicyForm['mode'] })}>
      <option value="none">使用しない</option><option value="all">すべて</option><option value="filtered">条件による選択</option><option value="explicit">明示指定のみ</option></select></label>
    <p>無効な入力欄の値も保持します。明示指定とタグ一致の和集合から、除外ID・除外タグを優先して除きます。</p>
    {(['allOf', 'anyOf', 'noneOf', 'include', 'exclude'] as const).map(field => {
      const title = { allOf: '必須タグ', anyOf: 'いずれかのタグ', noneOf: '除外タグ', include: '明示ID', exclude: '除外ID' }[field];
      return <label key={field}>{title}（カンマ区切り）<textarea aria-label={`${label}${title}`} rows={2} value={policy[field]}
        disabled={field === 'include' ? !include : field === 'exclude' || field === 'noneOf' ? !active : !positive}
        onChange={e => onChange({ [field]: e.target.value })} /></label>;
    })}
    <button disabled={!include} onClick={() => openPicker(false)}>{label} Libraryから明示指定</button>
    <button disabled={!active} onClick={() => openPicker(true)}>{label} Libraryから除外指定</button>
  </section>;
}

export function ThemeMaterialPicker({ pieces, contents, kind, initial, close, apply, ready, error, reload }: {
  pieces: Piece[]; contents: ContentDefinition[]; kind: 'piece' | ContentKind; initial: string; close: () => void; apply: (text: string) => void;
  ready: boolean; error: string; reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const [chosen, setChosen] = useState(() => new Set(initial.trim() ? parseStringList(initial, 'ID') : []));
  const values = useMemo(() => kind === 'piece' ? pieces.filter(p => [p.name, p.shape, ...(p.tags ?? [])].some(v => v.toLowerCase().includes(query.trim().toLowerCase())))
    : searchContents(contents, query, kind), [pieces, contents, kind, query]);
  const actualPage = Math.min(page, Math.max(0, Math.ceil(values.length / 50) - 1));
  return <div className="theme-modal"><section role="dialog" aria-modal="true" aria-label="テーマ素材の選択"><h2>素材を選択</h2>
    {error && <p role="alert">{error}</p>}{!ready && <p role="status">素材を読み込んでいます…</p>}<button onClick={() => void reload()}>素材一覧を再取得</button>
    <label>検索<input aria-label="テーマ素材検索" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
    <p>{values.length}件 / 選択 {chosen.size}件（最大{SELECTION_LIMITS.ids}件。未解決・非表示の指定IDも保持します）</p>
    <div className="theme-candidates">{values.slice(actualPage * 50, (actualPage + 1) * 50).map(v => <label key={v.id}>
      <input type="checkbox" aria-label={`${v.name}（${v.id}）をテーマ候補に選択`} checked={chosen.has(v.id)} disabled={!chosen.has(v.id) && chosen.size >= SELECTION_LIMITS.ids} onChange={e => setChosen(previous => {
        const next = new Set(previous); if (e.target.checked) next.add(v.id); else next.delete(v.id); return next;
      })} />{v.name} / {'kind' in v ? CONTENT_LABELS[v.kind] : v.shape}<small>{(v.tags ?? []).join(', ')} / {v.id}</small></label>)}</div>
    <button disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>前の素材</button><button disabled={(actualPage + 1) * 50 >= values.length} onClick={() => setPage(actualPage + 1)}>次の素材</button>
    <button onClick={() => apply(formatStringList([...chosen]))}>選択を反映</button><button onClick={close}>キャンセル</button>
  </section></div>;
}
