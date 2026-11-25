import { useEffect, useState } from 'react';
import type { PlacedRoom } from '../../model/types';
import { normalizeRoomInformation } from '../../model/roomInformation';
import { useDungeonStore } from '../../store';

export function RoomInformationForm({ room }: { room: PlacedRoom }) {
  const update = useDungeonStore(s => s.updateRoomInformation);
  const [draft, setDraft] = useState(room.information);
  const [tags, setTags] = useState(room.information.tags.join(', '));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setDraft(room.information); setTags(room.information.tags.join(', ')); setError('');
  }, [room.information]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(room.information)
    || tags !== room.information.tags.join(', ');
  return <form aria-label="部屋情報" onSubmit={event => {
    event.preventDefault();
    const value = { ...draft, tags: tags.split(',') };
    const result = update(room.id, value);
    setError(result ?? '');
    if (result) { setMessage(''); return; }
    const normalized = normalizeRoomInformation(value, value.number.trim());
    setDraft(normalized); setTags(normalized.tags.join(', ')); setMessage('部屋情報を適用しました。');
  }} style={{ display: 'grid', gap: 8, marginBottom: 16, fontSize: 12 }}>
    <label>部屋番号<input aria-label="部屋番号" value={draft.number} style={field}
      onChange={e => { setDraft({ ...draft, number: e.target.value }); setMessage(''); }} /></label>
    <label>部屋名称<input aria-label="部屋名称" value={draft.name} placeholder={room.piece.name} style={field}
      onChange={e => { setDraft({ ...draft, name: e.target.value }); setMessage(''); }} /></label>
    <label>部屋タグ（カンマ区切り）<input aria-label="部屋タグ" value={tags} style={field}
      onChange={e => { setTags(e.target.value); setMessage(''); }} /></label>
    <label>公開説明（Markdown）<textarea aria-label="公開説明" rows={4} value={draft.description} style={field}
      onChange={e => { setDraft({ ...draft, description: e.target.value }); setMessage(''); }} /></label>
    <label>GM専用情報（Markdown）<textarea aria-label="GM専用情報" rows={4} value={draft.gmNotes} style={field}
      onChange={e => { setDraft({ ...draft, gmNotes: e.target.value }); setMessage(''); }} /></label>
    <p style={{ color: '#64748b' }}>{dirty ? '未適用の変更があります。' : '入力後に適用してください。'}</p>
    <button type="submit" style={{ padding: 6, cursor: 'pointer' }}>部屋情報を適用</button>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {message && <p role="status" style={{ color: '#166534' }}>{message}</p>}
  </form>;
}

const field = { display: 'block', width: '100%', padding: 5, marginTop: 4,
  border: '1px solid #94a3b8', borderRadius: 4, font: 'inherit', resize: 'vertical' as const };
