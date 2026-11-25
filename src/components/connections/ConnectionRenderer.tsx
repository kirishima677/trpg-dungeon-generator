import { useShallow } from 'zustand/shallow';
import { useMemo } from 'react';
import { useDungeonStore } from '../../store';
import { routeConnections } from '../../editor/connectors/routing/connectionRouter';
import { createOccupancyGrid } from '../../editor/connectors/routing/occupancyGrid';

const GRID_SIZE = 40;

export function ConnectionRenderer() {
  const { dungeon, selectedConnectionId, editorMode, selectConnection, deleteConnection } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon,
    selectedConnectionId: s.selectedConnectionId,
    editorMode: s.editorMode,
    selectConnection: s.selectConnection,
    deleteConnection: s.deleteConnection,
  })));

  const grid = useMemo(() => createOccupancyGrid(dungeon.rooms), [dungeon.rooms]);
  const results = useMemo(() => routeConnections(dungeon.connections, dungeon.rooms, grid),
    [dungeon.connections, dungeon.rooms, grid]);

  return (
    <g aria-label="接続線">
      {dungeon.connections.map(connection => {
        const result = results.get(connection.id);
        if (!result || result.status === 'invalid') return null;
        const failed = result.status !== 'success';
        const route = result.status === 'success' ? result.route : result.fallback;
        const warning = result.status === 'unreachable' ? '経路を確保できません。接続口の外側や障害物を確認してください。'
          : result.status === 'limit-exceeded' ? '経路探索の上限に達しました。部屋の距離や配置を調整してください。' : '';
        const d = route.points.map((point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x * GRID_SIZE} ${point.y * GRID_SIZE}`).join(' ');
        const selected = connection.id === selectedConnectionId;
        const choose = () => editorMode === 'delete'
          ? deleteConnection(connection.id) : selectConnection(connection.id);
        return (
          <g key={connection.id} data-connection-id={connection.id} data-routing-status={result.status}>
            <path d={d} fill="none" stroke={failed ? '#dc2626' : selected ? '#2563eb' : connection.type === 'secret' ? '#7c3aed' : '#475569'}
              strokeWidth={selected ? 4 : 3} strokeDasharray={connection.type === 'secret' ? '6 4' : undefined}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {/* A larger transparent hit area keeps thin lines easy to select. */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              pointerEvents={editorMode === 'place' ? 'none' : 'stroke'}
              role="button" tabIndex={editorMode === 'place' ? -1 : 0}
              aria-label={`接続線 ${connection.type} ${connection.id}${warning ? ` — 警告: ${warning}` : ''}`}
              aria-pressed={selected}
              style={{ cursor: editorMode === 'delete' ? 'not-allowed' : 'pointer' }}
              onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
              onClick={e => { e.stopPropagation(); choose(); }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(); }
              }}>
              <title>{warning || `接続線 (${connection.type}) — クリックで選択、削除モードで削除`}</title>
            </path>
          </g>
        );
      })}
    </g>
  );
}
