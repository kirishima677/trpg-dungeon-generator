import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { routeConnection } from '../../editor/connectors/routing/connectionRouter';

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
        const route = routeConnection(connection, dungeon.rooms);
        if (!route) return null;
        const d = route.points.map((point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x * GRID_SIZE} ${point.y * GRID_SIZE}`).join(' ');
        const selected = connection.id === selectedConnectionId;
        const choose = () => editorMode === 'delete'
          ? deleteConnection(connection.id) : selectConnection(connection.id);
        return (
          <g key={connection.id} data-connection-id={connection.id}>
            <path d={d} fill="none" stroke={selected ? '#2563eb' : connection.type === 'secret' ? '#7c3aed' : '#475569'}
              strokeWidth={selected ? 4 : 3} strokeDasharray={connection.type === 'secret' ? '6 4' : undefined}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {/* A larger transparent hit area keeps thin lines easy to select. */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
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
            </path>
          </g>
        );
      })}
    </g>
  );
}
