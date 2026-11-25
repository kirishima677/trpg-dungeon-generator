import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { roomDisplayLabel } from '../../model/roomInformation';

export function RoomList() {
  const { rooms, selectedRoomId, selectRoom, setEditorMode } = useDungeonStore(useShallow(s => ({
    rooms: s.dungeon.rooms, selectedRoomId: s.selectedRoomId, selectRoom: s.selectRoom, setEditorMode: s.setEditorMode,
  })));
  return <div aria-label="部屋一覧" style={{ display: 'grid', gap: 6 }}>
    {rooms.length === 0 && <p style={{ fontSize: 12 }}>部屋は未配置です。</p>}
    {rooms.map(room => <button key={room.id} aria-pressed={room.id === selectedRoomId} onClick={() => {
      setEditorMode('select'); selectRoom(room.id);
    }} style={{ textAlign: 'left', padding: 8, borderRadius: 6, cursor: 'pointer', overflowWrap: 'anywhere',
      border: '1px solid #cbd5e1', background: room.id === selectedRoomId ? '#dbeafe' : 'white' }}>
      {roomDisplayLabel(room)}
    </button>)}
  </div>;
}
