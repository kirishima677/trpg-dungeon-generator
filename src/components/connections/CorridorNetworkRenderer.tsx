import { useMemo, useState } from 'react';
import type React from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { GRID_SIZE } from '../../editor/grid';
import { connectionActionForCell } from '../../editor/connectors/corridor/corridorNetwork';
import type { CorridorNetwork, CorridorNetworkCell } from '../../editor/connectors/corridor/corridorNetwork';
import { CorridorRenderer } from './CorridorRenderer';

export function CorridorNetworkRenderer({ network }: { network: CorridorNetwork }) {
  const { selectedConnectionId, editorMode, selectConnection, deleteConnection } = useDungeonStore(useShallow(s => ({
    selectedConnectionId: s.selectedConnectionId, editorMode: s.editorMode,
    selectConnection: s.selectConnection, deleteConnection: s.deleteConnection,
  })));
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const cells = useMemo(() => network.cells.filter(cell => cell.type === 'corridor'), [network]);
  const ids = useMemo(() => [...new Set(cells.flatMap(cell => cell.sourceConnectionIds))].sort(), [cells]);
  const selectedKeys = useMemo(() => new Set(cells.filter(cell => selectedConnectionId !== null
    && cell.sourceConnectionIds.includes(selectedConnectionId)).map(cell => `${cell.x},${cell.y}`)), [cells, selectedConnectionId]);
  if (cells.length === 0) return null;
  const active = (activeKey ? network.byCoordinate.get(activeKey)?.find(cell => cell.type === 'corridor') : null) ?? cells[0];
  const interactive = editorMode !== 'place';

  const choose = (cell: CorridorNetworkCell) => {
    const action = connectionActionForCell(cell, selectedConnectionId, editorMode === 'delete');
    if (action?.type === 'delete') deleteConnection(action.connectionId);
    else if (action) selectConnection(action.connectionId);
  };
  const clickedCell = (event: React.MouseEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement, matrix = event.currentTarget.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const world = point.matrixTransform(matrix.inverse());
    const key = `${Math.floor(world.x / GRID_SIZE)},${Math.floor(world.y / GRID_SIZE)}`;
    const cell = network.byCoordinate.get(key)?.find(candidate => candidate.type === 'corridor');
    if (cell) setActiveKey(key);
    return cell;
  };
  return (
    <g data-corridor-network="true" data-network-cell-count={cells.length}
      data-connection-id={ids.length === 1 ? ids[0] : undefined}
      data-active-cell={`${active.x},${active.y}`} data-active-mask={active.connections}
      data-active-connections={active.sourceConnectionIds.join(',')}
      role="button" tabIndex={interactive ? 0 : -1}
      aria-label="通路ネットワーク。共有セルは再クリックで接続を切替。Enter・Spaceで選択。"
      style={{ cursor: 'pointer', outline: 'none' }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onMouseDown={e => { if (e.button === 0 && interactive) e.stopPropagation(); }}
      onClick={e => {
        if (!interactive) return;
        e.stopPropagation();
        const cell = clickedCell(e);
        if (cell) choose(cell);
      }}
      onKeyDown={e => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); e.stopPropagation(); choose(active);
        }
      }}>
      <title>{active.sourceConnectionIds.length > 1
        ? `共有通路 (${active.sourceConnectionIds.length}接続)。再クリックで切替。削除は選択後に右パネルまたはDeleteキーで実行。`
        : '通路 — クリックで接続を選択、削除モードで削除'}</title>
      <CorridorRenderer cells={cells} isSelected={false} selectedCellKeys={selectedKeys} interactive={interactive} />
      {focused && <rect data-network-focus="true" x={(active.x + 0.1) * GRID_SIZE} y={(active.y + 0.1) * GRID_SIZE}
        width={GRID_SIZE * 0.8} height={GRID_SIZE * 0.8} fill="none" stroke="#2563eb"
        strokeWidth={1.5} strokeDasharray="4 2" pointerEvents="none" />}
    </g>
  );
}
