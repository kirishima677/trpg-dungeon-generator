import {RoomFactionPanel} from '../factions/RoomFactionPanel';
import React, { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { getWorldConnectors } from '../../utils/geometry';
import { RoomInformationForm } from './RoomInformationForm';
import { roomDisplayLabel } from '../../model/roomInformation';
import './entities.css';

const RoomEntityPanel = lazy(() => import('../entities/RoomEntityPanel').then(m => ({ default: m.RoomEntityPanel })));
const RoomThemePanel = lazy(() => import('../themes/RoomThemePanel').then(m => ({ default: m.RoomThemePanel })));

export function PropertiesPanel() {
  const [tab, setTab] = useState<'basic' | 'entity' | 'theme' | 'faction'>('basic');
  const [openedThemes, setOpenedThemes] = useState(false),[duplicateError,setDuplicateError] = useState('');
  const [openedEntities, setOpenedEntities] = useState(false);
  const { dungeon, selectedRoomId, rotateRoom, deleteRoom, selectedConnectionId, deleteConnection, selectConnection } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon,
    selectedRoomId: s.selectedRoomId,
    rotateRoom: s.rotateRoom,
    deleteRoom: s.deleteRoom,
    selectedConnectionId: s.selectedConnectionId,
    deleteConnection: s.deleteConnection,
    selectConnection: s.selectConnection,
  })));

  const picker = dungeon.connections.length > 0 && (
    <div style={{ marginBottom: 12 }}>
      <select aria-label="接続を選択" value={selectedConnectionId ?? ''}
        onChange={e => selectConnection(e.target.value || null)} style={{ width: '100%', fontSize: 12 }}>
        <option value="">接続を選択…</option>
        {dungeon.connections.map((c, index) => (
          <option key={c.id} value={c.id}>
            接続{index + 1} / {c.type} / {c.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
        共有セルは再クリックで接続を切替。削除は選択後に実行できます。
      </p>
    </div>
  );

  const connection = dungeon.connections.find(c => c.id === selectedConnectionId);
  if (connection) {
    const endpointLabel = (roomId: string, connectorId: string) => {
      const room = dungeon.rooms.find(r => r.id === roomId);
      const connector = room && getWorldConnectors(room).find(c => c.id === connectorId);
      return `${room ? roomDisplayLabel(room) : roomId} / ${connector?.worldDirection ?? connectorId}`;
    };
    return (
      <div style={panelStyle}>
        {picker}
        <p style={{ fontWeight: 700, marginBottom: 8 }}>接続線</p>
        <p style={{ fontSize: 12 }}>種類: {connection.type}</p>
        <p style={{ fontSize: 12, margin: '8px 0' }}>{endpointLabel(connection.fromRoomId, connection.fromConnectorId)}</p>
        <p style={{ fontSize: 12, margin: '8px 0' }}>↔ {endpointLabel(connection.toRoomId, connection.toConnectorId)}</p>
        <button onClick={() => deleteConnection(connection.id)}
          style={{ ...actionBtn, width: '100%', background: '#fee2e2', color: '#dc2626' }}>
          接続を削除
        </button>
      </div>
    );
  }

  const room = selectedRoomId ? dungeon.rooms.find(r => r.id === selectedRoomId) : null;
  if (!room) {
    return (
      <div style={panelStyle}>
        {picker}
        <p style={{ color: '#94a3b8', fontSize: 12 }}>部屋または接続線を選択してください</p>
      </div>
    );
  }

  const connectors = getWorldConnectors(room);

  return (
    <div style={panelStyle}>
      {picker}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#334155', marginBottom: 8 }}>
        部屋プロパティ
      </div>
      <nav aria-label="部屋プロパティの種類" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button aria-pressed={tab === 'basic'} onClick={() => setTab('basic')}>基本情報</button>
        <button aria-pressed={tab === 'entity'} onClick={() => { setTab('entity'); setOpenedEntities(true); }}>Entity</button>
        <button aria-pressed={tab==='faction'} onClick={()=>setTab('faction')}>勢力</button>
        <button aria-pressed={tab === 'theme'} onClick={() => { setTab('theme');setOpenedThemes(true); }}>Room Theme</button>
      </nav>
      <div hidden={tab !== 'basic'}>
      <RoomInformationForm key={room.id} room={room} />
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>素材: {room.piece.name}</p>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={tdLabel}>位置</td>
            <td style={tdVal}>({room.position.x}, {room.position.y})</td>
          </tr>
          <tr>
            <td style={tdLabel}>回転</td>
            <td style={tdVal}>{room.rotation}°</td>
          </tr>
          <tr>
            <td style={tdLabel}>形状</td>
            <td style={tdVal}>{room.piece.shape}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', margin: '10px 0 4px' }}>
        コネクター ({connectors.length})
      </div>
      {connectors.map(c => (
        <div
          key={c.id}
          style={{
            fontSize: 11,
            color: '#64748b',
            padding: '2px 0',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          {c.worldDirection} / {c.kind} / 幅:{c.width}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={() => setDuplicateError(useDungeonStore.getState().duplicateRoom(room.id)??'')} style={actionBtn}>部屋を複製</button>
        <button onClick={() => rotateRoom(room.id)} style={actionBtn}>
          🔄 回転
        </button>
        <button
          onClick={() => deleteRoom(room.id)}
          style={{ ...actionBtn, background: '#fee2e2', color: '#dc2626' }}
        >
          🗑 削除
        </button>
      </div>
      {duplicateError&&<p role="alert">{duplicateError}</p>}
      </div>
      {openedEntities && <div hidden={tab !== 'entity'}><Suspense fallback={<p>Entityを準備しています…</p>}><RoomEntityPanel key={room.id} roomId={room.id} /></Suspense></div>}
      {tab==='faction'&&<RoomFactionPanel key={`${room.id}:${JSON.stringify(dungeon.roomFactionAssignments.find(a=>a.roomId===room.id))}`} roomId={room.id} />}
      {openedThemes && <div hidden={tab !== 'theme'}><Suspense fallback={<p>Room Themeを準備しています…</p>}><RoomThemePanel key={room.id} roomId={room.id} /></Suspense></div>}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 240, flexShrink: 0,
  padding: 12,
  background: '#f8fafc',
  borderLeft: '1px solid #e2e8f0',
  overflowY: 'auto',
};

const tdLabel: React.CSSProperties = {
  color: '#64748b',
  paddingRight: 8,
  paddingBottom: 4,
  whiteSpace: 'nowrap',
};

const tdVal: React.CSSProperties = {
  color: '#1e293b',
  paddingBottom: 4,
};

const actionBtn: React.CSSProperties = {
  flex: 1,
  padding: '4px 0',
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  background: '#f1f5f9',
  cursor: 'pointer',
  fontSize: 12,
};
