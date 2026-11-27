import { useMemo, useState } from 'react';
import { CONTENT_KINDS, CONTENT_LABELS } from '../../model/content';
import type { ContentDefinition, ContentKind } from '../../model/content';
import { searchContents } from '../../content/contentSearch';
import { ENTITY_LIMITS } from '../../model/entity';

export function ContentSelectionDialog({ contents, busy, error, onAdd, onClose }: {
  contents: ContentDefinition[]; busy: boolean; error: string; onAdd: (id: string, quantity: number) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState<ContentKind | ''>('');
  const [selected, setSelected] = useState(''), [quantity, setQuantity] = useState('1'), [page, setPage] = useState(0);
  const filtered = useMemo(() => searchContents(contents, query, kind), [contents, query, kind]);
  const actualPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const content = contents.find(c => c.id === selected);
  const valid = Number.isSafeInteger(Number(quantity)) && Number(quantity) >= 1 && Number(quantity) <= ENTITY_LIMITS.quantity;
  return <div className="entity-modal"><section role="dialog" aria-modal="true" aria-label="部屋へEntityを追加">
    <h2>コンテンツを選択</h2><p>配置時の定義をコピーします。公開範囲の初期値はGM専用です。</p>
    <fieldset disabled={busy}>
      <label>検索<input aria-label="Entity素材検索" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <label>種別<select aria-label="Entity素材の種別" value={kind} onChange={e => { setKind(e.target.value as ContentKind | ''); setPage(0); }}>
        <option value="">すべて</option>{CONTENT_KINDS.map(k => <option key={k} value={k}>{CONTENT_LABELS[k]}</option>)}</select></label>
      <p>{filtered.length}件</p>
      <div className="entity-choices">{filtered.slice(actualPage * 50, (actualPage + 1) * 50).map(c => <button type="button" key={c.id} aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
        <strong>{c.name}</strong> / {CONTENT_LABELS[c.kind]}<p>{c.summary}</p><small>{c.tags.join(' / ')} / {c.id}</small>
      </button>)}</div>
      <nav><button disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>前の素材</button>
        <button disabled={(actualPage + 1) * 50 >= filtered.length} onClick={() => setPage(actualPage + 1)}>次の素材</button></nav>
      <p>選択中: {content?.name ?? '未選択'}</p>
      <label>数量<input aria-label="追加するEntityの数量" inputMode="numeric" maxLength={12} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      {!valid && <p role="alert">数量は1〜{ENTITY_LIMITS.quantity}の整数で指定してください。</p>}
      <button disabled={!content || !valid} onClick={() => onAdd(selected, Number(quantity))}>部屋へ追加</button>
      <button onClick={onClose}>閉じる</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </section></div>;
}
