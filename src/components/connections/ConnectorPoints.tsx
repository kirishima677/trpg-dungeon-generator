import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { getWorldConnectors } from '../../utils/geometry';
import { connectorPoint } from '../../editor/connectors/connectionGeometry';
import { usesEndpoint } from '../../model/connections';

const GRID_SIZE = 40;

export function ConnectorPoints() {
  const { dungeon, editorMode, pendingConnector, chooseConnector } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon, editorMode: s.editorMode, pendingConnector: s.pendingConnector,
    chooseConnector: s.chooseConnector,
  })));
  if (editorMode !== 'connect') return null;
  return (
    <g aria-label="接続ポイント">
      {dungeon.rooms.flatMap((room, index) => getWorldConnectors(room).map(connector => {
        const endpoint = { roomId: room.id, connectorId: connector.id };
        const occupied = dungeon.connections.some(connection => usesEndpoint(connection, endpoint));
        const selected = pendingConnector?.roomId === room.id && pendingConnector.connectorId === connector.id;
        const sameRoom = pendingConnector?.roomId === room.id && !selected;
        const disabled = occupied || sameRoom;
        const point = connectorPoint(connector);
        const status = occupied ? '接続済み' : selected ? '選択中' : sameRoom ? '別の部屋を選択してください' : '未接続';
        const label = `部屋${index + 1} ${room.piece.name} / ${connector.worldDirection} / ${connector.id} (${status})`;
        return (
          <circle key={`${room.id}-${connector.id}`}
            data-room-id={room.id} data-connector-id={connector.id} data-status={status}
            cx={point.x * GRID_SIZE} cy={point.y * GRID_SIZE} r={selected ? 9 : 7}
            fill={selected ? '#2563eb' : occupied ? '#64748b' : 'white'}
            stroke={selected ? '#1e3a8a' : occupied ? '#334155' : '#2563eb'} strokeWidth={2}
            strokeDasharray={occupied ? '2 2' : undefined} opacity={sameRoom ? 0.5 : 1}
            role="button" tabIndex={disabled ? -1 : 0} aria-label={label}
            aria-pressed={selected} aria-disabled={disabled}
            style={{ cursor: disabled ? 'not-allowed' : 'crosshair' }}
            onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
            onClick={e => { e.stopPropagation(); if (!disabled) chooseConnector(endpoint); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation(); if (!disabled) chooseConnector(endpoint);
              }
            }}>
            <title>{label}</title>
          </circle>
        );
      }))}
    </g>
  );
}
