import { useShallow } from 'zustand/shallow';
import type React from 'react';
import { useDungeonStore } from '../../store';
import { GRID_SIZE } from '../../editor/grid';
import type { ConnectionScene } from '../../editor/connectors/corridor/connectionScene';
import { CorridorRenderer } from './CorridorRenderer';

interface ConnectionRendererProps {
  scene: ConnectionScene;
  layer: 'corridors' | 'overlays';
}

export function ConnectionRenderer({ scene, layer }: ConnectionRendererProps) {
  const { selectedConnectionId, editorMode, selectConnection, deleteConnection } = useDungeonStore(useShallow(s => ({
    selectedConnectionId: s.selectedConnectionId,
    editorMode: s.editorMode,
    selectConnection: s.selectConnection,
    deleteConnection: s.deleteConnection,
  })));

  return (
    <g aria-label={layer === 'corridors' ? '通路の床と壁' : '接続線・警告'}>
      {scene.drawings.map(({ connection, result, corridor }) => {
        if (result.status === 'invalid') return null;
        const visibleCorridor = corridor?.status === 'success' ? corridor : null;
        const hasFloor = visibleCorridor && visibleCorridor.cells.length > 0;
        if ((layer === 'corridors') !== Boolean(hasFloor)) return null;
        const failed = result.status !== 'success';
        const route = result.status === 'success' ? result.route : result.fallback;
        const warning = result.status === 'unreachable' ? '経路を確保できません。接続口の外側や障害物を確認してください。'
          : result.status === 'limit-exceeded' ? '経路探索の上限に達しました。部屋の距離や配置を調整してください。'
          : corridor?.status === 'limit-exceeded' ? '通路セルの展開上限に達したため線で表示しています。'
          : corridor?.status === 'invalid-route' ? '通路セルを生成できないため線で表示しています。' : '';
        const d = route.points.map((point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x * GRID_SIZE} ${point.y * GRID_SIZE}`).join(' ');
        const selected = connection.id === selectedConnectionId;
        const choose = () => editorMode === 'delete'
          ? deleteConnection(connection.id) : selectConnection(connection.id);
        const controls = {
          role: 'button', tabIndex: editorMode === 'place' ? -1 : 0,
          'aria-label': `${visibleCorridor ? '通路' : '接続線'} ${connection.type} ${connection.id}${warning ? ` — 警告: ${warning}` : ''}`,
          'aria-pressed': selected,
          // SVG's default group focus outline can cross rooms between disjoint
          // cell subpaths. Use the corridor's own selection colour instead.
          style: { cursor: editorMode === 'delete' ? 'not-allowed' : 'pointer', outline: 'none' },
          onFocus: () => selectConnection(connection.id),
          onMouseDown: (e: React.MouseEvent<SVGElement>) => { if (e.button === 0) e.stopPropagation(); },
          onClick: (e: React.MouseEvent<SVGElement>) => { e.stopPropagation(); choose(); },
          onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(); }
          },
        };
        if (hasFloor) return (
          <g key={connection.id} data-connection-id={connection.id} data-routing-status={result.status}
            data-corridor-status="success" data-cell-count={visibleCorridor.cells.length} {...controls}>
            <title>通路 — クリックで接続全体を選択、削除モードで削除</title>
            <CorridorRenderer cells={visibleCorridor.cells} isSelected={selected} interactive={editorMode !== 'place'} />
          </g>
        );
        const color = failed ? '#dc2626' : warning ? '#b45309' : selected ? '#2563eb'
          : connection.type === 'secret' ? '#7c3aed' : '#475569';
        return (
          <g key={connection.id} data-connection-id={connection.id} data-routing-status={result.status}
            data-corridor-status={corridor?.status ?? 'line'} {...controls}>
            {result.status === 'success' && result.method === 'direct' ? (
              <circle cx={route.points[0].x * GRID_SIZE} cy={route.points[0].y * GRID_SIZE}
                r={GRID_SIZE * 0.14} fill={selected ? '#bfdbfe' : 'white'} stroke={color} strokeWidth={2}
                pointerEvents={editorMode === 'place' ? 'none' : 'all'} />
            ) : (
              <>
                <path d={d} fill="none" stroke={color}
                  strokeWidth={selected ? 4 : 3} strokeDasharray={connection.type === 'secret' ? '6 4' : undefined}
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                {/* A larger transparent hit area keeps thin lines easy to select. */}
                <path d={d} fill="none" stroke="transparent" strokeWidth={14}
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                  pointerEvents={editorMode === 'place' ? 'none' : 'stroke'}>
                  <title>{warning || `接続線 (${connection.type}) — クリックで選択、削除モードで削除`}</title>
                </path>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
