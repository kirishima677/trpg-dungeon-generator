import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { connectionEndpoints } from '../../editor/connectors/connectionGeometry';

const GRID_SIZE = 40;

export function ConnectionRenderer() {
  const { dungeon, selectedConnectionId, editorMode, selectConnection, deleteConnection } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon,
    selectedConnectionId: s.selectedConnectionId,
    editorMode: s.editorMode,
    selectConnection: s.selectConnection,
    deleteConnection: s.deleteConnection,
  })));

  return (
    <g aria-label="接続線">
      {dungeon.connections.map(connection => {
        const endpoints = connectionEndpoints(connection, dungeon.rooms);
        if (!endpoints) return null;
        const coordinates = {
          x1: endpoints.from.x * GRID_SIZE, y1: endpoints.from.y * GRID_SIZE,
          x2: endpoints.to.x * GRID_SIZE, y2: endpoints.to.y * GRID_SIZE,
        };
        const selected = connection.id === selectedConnectionId;
        const choose = () => editorMode === 'delete'
          ? deleteConnection(connection.id) : selectConnection(connection.id);
        return (
          <g key={connection.id} data-connection-id={connection.id}>
            <line {...coordinates} stroke={selected ? '#2563eb' : connection.type === 'secret' ? '#7c3aed' : '#475569'}
              strokeWidth={selected ? 4 : 3} strokeDasharray={connection.type === 'secret' ? '6 4' : undefined}
              vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {/* A larger transparent hit area keeps thin lines easy to select. */}
            <line {...coordinates} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke"
              pointerEvents={editorMode === 'place' ? 'none' : 'stroke'}
              role="button" tabIndex={editorMode === 'place' ? -1 : 0}
              aria-label={`接続線 ${connection.type} ${connection.id}`}
              aria-pressed={selected}
              style={{ cursor: editorMode === 'delete' ? 'not-allowed' : 'pointer' }}
              onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); choose(); }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(); }
              }}>
              <title>接続線 ({connection.type}) — クリックで選択、削除モードで削除</title>
            </line>
          </g>
        );
      })}
    </g>
  );
}
