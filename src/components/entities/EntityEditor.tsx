import type {FactionInstance} from '../../model/factionState';
import {factionDisplayName} from '../../model/factionState';
import { useEffect, useMemo, useState } from 'react';
import type { EntityInstance, EntityEdits } from '../../model/entity';
import { ENTITY_LIMITS } from '../../model/entity';
import { CONTENT_LABELS } from '../../model/content';
import { ContentMarkdown } from '../content/ContentFields';
import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';

function SnapshotDetails({ entity }: { entity: EntityInstance }) {
  const s = entity.contentSnapshot;
  const description = useMemo(() => renderMarkdownToHtml(s.description, true), [s.description]);
  const notes = useMemo(() => renderMarkdownToHtml(s.gmNotes, true), [s.gmNotes]);
  return <details><summary>配置時点の素材を確認</summary><p>{s.name} / {CONTENT_LABELS[s.kind]}</p><p>{s.summary}</p>
    <p>元のContent ID: {entity.sourceContentId}</p><p>素材の更新日時: {s.updatedAt}</p><p>タグ: {s.tags.join(', ')}</p>
    <h4>素材の公開説明</h4><div className="entity-preview" dangerouslySetInnerHTML={{ __html: description }} />
    <h4>素材のGM専用情報</h4><div className="entity-preview" dangerouslySetInnerHTML={{ __html: notes }} />
    <dl>{Object.entries(s.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
  </details>;
}

export function EntityEditor({ entity, apply, onDirtyChange, factions }: { entity: EntityInstance; apply: (edits: EntityEdits,factionId?:string|null) => string | null; factions?:FactionInstance[]; onDirtyChange: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(entity), [quantity, setQuantity] = useState(String(entity.quantity));
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { setDraft(entity); setQuantity(String(entity.quantity)); setError(''); setMessage(''); }, [entity]);
  const dirty = quantity !== String(entity.quantity) || draft.customName !== entity.customName || draft.visibility !== entity.visibility
    || draft.factionId !== entity.factionId || draft.publicDescription !== entity.publicDescription || draft.gmNotes !== entity.gmNotes;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  return <section aria-label="Entityの編集">
    <p>Entity ID: {entity.id}</p><p>元の素材: {entity.contentSnapshot.name} / {CONTENT_LABELS[entity.contentSnapshot.kind]}</p>
    {entity.origin&&<p>Room Theme由来: {entity.origin.sourceRoomThemeId} / 必須項目: {entity.origin.requiredEntryId}</p>}
    {factions&&['monster','npc'].includes(entity.contentSnapshot.kind)&&<label>所属勢力<select aria-label="Entity所属勢力" value={draft.factionId??''} onChange={e=>setDraft({...draft,factionId:e.target.value||undefined})}><option value="">無所属</option>{factions.map(f=><option key={f.id} value={f.id}>{factionDisplayName(f)}</option>)}</select><small>この数量全体が1つの勢力に所属します。候補外でも手動設定できます。</small></label>}
    <label>個別名称<input aria-label="Entity個別名称" maxLength={ENTITY_LIMITS.name} value={draft.customName} placeholder={entity.contentSnapshot.name}
      onChange={e => setDraft({ ...draft, customName: e.target.value })} /></label>
    <label>数量<input aria-label="Entity数量" inputMode="numeric" maxLength={12} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
    <label>公開範囲<select aria-label="Entity公開範囲" value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as EntityInstance['visibility'] })}>
      <option value="gm-only">GM専用</option><option value="public">公開説明を公開可能</option></select></label>
    <p>プレイヤーへ公開するのは、公開指定した「配置の公開説明」のみです。名称・数量・素材情報は自動公開しません。</p>
    <ContentMarkdown prefix="配置の" maxLength={ENTITY_LIMITS.markdown} description={draft.publicDescription} gmNotes={draft.gmNotes}
      onChange={(field, value) => setDraft({ ...draft, [field === 'description' ? 'publicDescription' : 'gmNotes']: value })} />
    <p>{dirty ? '未適用の変更があります。操作前に適用してください。' : '入力後に適用してください。'}</p>
    <button onClick={() => {
      const result = apply({ quantity: Number(quantity), customName: draft.customName, publicDescription: draft.publicDescription, gmNotes: draft.gmNotes, visibility: draft.visibility },factions?(draft.factionId??null):undefined);
      setError(result ?? ''); setMessage(result ? '' : 'Entity情報を適用しました。');
      if (!result) setQuantity(String(Number(quantity)));
    }}>Entity情報を適用</button>
    <button disabled={!dirty} onClick={() => { setDraft(entity); setQuantity(String(entity.quantity)); setError(''); setMessage(''); }}>未適用のEntity変更を破棄</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <SnapshotDetails entity={entity} />
  </section>;
}
