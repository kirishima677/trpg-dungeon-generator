import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { CONTENT_KINDS, CONTENT_LABELS } from '../../model/content';
import { entityDisplayName } from '../../model/entity';
import type { EntityCommand } from '../../model/entity';
import type { ContentRepository } from '../../repository/contentRepository';
import { contentRepository } from '../../repository/contentRepository';
import { useContentLibrary } from '../content/useContentLibrary';
import { roomDisplayLabel } from '../../model/roomInformation';
import { EntityEditor } from './EntityEditor';
import { ContentSelectionDialog } from './ContentSelectionDialog';

export function RoomEntityPanel({ roomId, repository = contentRepository }: { roomId: string; repository?: ContentRepository }) {
  const { dungeon, change } = useDungeonStore(useShallow(s => ({ dungeon: s.dungeon, change: s.changeEntities })));
  const library = useContentLibrary(repository);
  const [selected, setSelected] = useState(''), [adding, setAdding] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [target, setTarget] = useState('');
  const request = useRef(0), active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current++; }; }, []);
  const entities = useMemo(() => dungeon.entities.filter(e => e.roomId === roomId), [dungeon.entities, roomId]);
  const entity = entities.find(e => e.id === selected);
  const latest = entity && library.contents.find(c => c.id === entity.sourceContentId);
  const command = (value: EntityCommand) => { const error = change(value); setError(error ?? ''); return error; };
  const withContent = async (id: string, operation: (content: NonNullable<Awaited<ReturnType<ContentRepository['get']>>>) => void) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    const token = ++request.current, dungeonId = dungeon.id;
    try {
      const content = await repository.get(id);
      if (!active.current || request.current !== token) return;
      const current = useDungeonStore.getState();
      if (current.dungeon.id !== dungeonId || current.selectedRoomId !== roomId) throw new Error('選択中の部屋が変わりました。もう一度操作してください。');
      if (!content) throw new Error('元のライブラリ素材が見つかりません。配置済みの定義は保持されています。');
      operation(content);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : '素材を取得できませんでした。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  return <section className="room-entities" aria-label="部屋のEntity">
    <h3>Entity</h3><p>この部屋に{entities.length}件。編集後は「Entity情報を適用」を押してください。</p>
    {library.error && <p role="alert">素材一覧: {library.error}</p>}
    <fieldset disabled={busy || adding || refreshing}>
      <button disabled={dirty || !library.ready || !!library.error} onClick={() => { setError(''); setAdding(true); }}>Entity追加</button>
      <button onClick={() => void library.reload()}>素材一覧を再取得</button>
      {CONTENT_KINDS.map(kind => {
        const values = entities.filter(e => e.contentSnapshot.kind === kind);
        return values.length ? <section key={kind}><h4>{CONTENT_LABELS[kind]}</h4>{values.map(e => <button className="entity-list-item" key={e.id} aria-pressed={selected === e.id}
          disabled={dirty && selected !== e.id} onClick={() => { setSelected(e.id); setError(''); setTarget(''); }}>
          {entityDisplayName(e)} × {e.quantity} / {e.visibility === 'public' ? '公開説明あり' : 'GM専用'}<small>{e.id}</small>
        </button>)}</section> : null;
      })}
      {entity && <>
        <EntityEditor key={entity.id} entity={entity} factions={dungeon.factions} apply={(edits,factionId) => command({ type: 'edit', id: entity.id, edits, factionId })} onDirtyChange={setDirty} />
        {library.ready && !library.error && !latest && <p>元のライブラリ素材は存在しません。配置済みの定義は保持されています。</p>}
        {latest && latest.kind !== entity.contentSnapshot.kind && <p>元の素材の種別が変更されています。更新せず、Entityを再登録してください。</p>}
        <button disabled={dirty || !latest || !!library.error || latest.kind !== entity.contentSnapshot.kind}
          onClick={() => { setError(''); setRefreshing(true); }}>ライブラリの最新版を反映</button>
        <button disabled={dirty} onClick={() => command({ type: 'duplicate', id: entity.id })}>Entityを複製</button>
        <label>移動先<select aria-label="Entityの移動先" disabled={dirty} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">部屋を選択…</option>{dungeon.rooms.filter(r => r.id !== roomId).map(r => <option key={r.id} value={r.id}>{roomDisplayLabel(r)}</option>)}</select></label>
        <button disabled={dirty || !target} onClick={() => { if (!command({ type: 'move', id: entity.id, roomId: target })) { setSelected(''); setTarget(''); } }}>別の部屋へ移動</button>
        <button disabled={dirty} onClick={() => { if (!command({ type: 'delete', id: entity.id })) setSelected(''); }}>Entityを削除</button>
      </>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {adding && <ContentSelectionDialog contents={library.contents} busy={busy} error={error || library.error} onClose={() => setAdding(false)}
      onAdd={(id, quantity) => void withContent(id, content => {
        if (!command({ type: 'add', roomId, content, quantity })) { setAdding(false); setSelected(useDungeonStore.getState().dungeon.entities.at(-1)!.id); }
      })} />}
    {refreshing && entity && <div className="entity-modal"><section role="dialog" aria-modal="true" aria-label="素材の更新確認">
      <h3>配置時点の定義を更新しますか？</h3><p>素材の定義だけを置き換えます。個別名称・数量・補足・公開範囲は保持します。Undoで戻せます。</p>
      <button disabled={busy} onClick={() => void withContent(entity.sourceContentId, content => {
        if (!command({ type: 'refresh', id: entity.id, content })) setRefreshing(false);
      })}>更新を確定</button><button disabled={busy} onClick={() => setRefreshing(false)}>キャンセル</button>
      {error && <p role="alert">{error}</p>}
    </section></div>}
  </section>;
}
