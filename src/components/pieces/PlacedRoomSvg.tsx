import React, { useCallback, useRef, useState } from 'react';
import type { PlacedRoom } from '../../model/types';
import { getWorldCells, getWorldConnectors } from '../../utils/geometry';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { connectorPoint } from '../../editor/connectors/connectionGeometry';
import { GRID_LINE_COLOR, GRID_LINE_WIDTH, GRID_SIZE } from '../../editor/grid';
import { DIRECTION_BITS } from '../../editor/connectors/corridor/directions';
import { corridorWalls } from '../../editor/connectors/corridor/corridorShape';
import { RoomLabel } from './RoomLabel';

interface PlacedRoomSvgProps {
  room: PlacedRoom;
  isSelected: boolean;
  openConnectorIds?: ReadonlySet<string>;
}

export function PlacedRoomSvg({ room, isSelected, openConnectorIds }: PlacedRoomSvgProps) {
  const { selectRoom, moveRoom, deleteRoom, editorMode } = useDungeonStore(useShallow(s => ({
    selectRoom: s.selectRoom,
    moveRoom: s.moveRoom,
    deleteRoom: s.deleteRoom,
    editorMode: s.editorMode,
  })));
  const { view, roomLabels } = useDungeonStore(useShallow(s => ({ view: s.view, roomLabels: s.roomLabels })));

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, rx: 0, ry: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const cells = getWorldCells(room);
  const connectors = getWorldConnectors(room);
  const openings = new Map<string, number>();
  for (const connector of connectors) {
    if (!openConnectorIds?.has(connector.id)) continue;
    const key = `${connector.worldPosition.x},${connector.worldPosition.y}`;
    openings.set(key, (openings.get(key) ?? 0) | DIRECTION_BITS[connector.worldDirection]);
  }

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || editorMode === 'place' || editorMode === 'connect') return;
      if (editorMode === 'delete') {
        deleteRoom(room.id);
        return;
      }
      e.stopPropagation();
      selectRoom(room.id);
      dragging.current = true;
      setIsDragging(true);
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        rx: room.position.x,
        ry: room.position.y,
      };

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const dx = Math.round((ev.clientX - dragStart.current.mx) / (GRID_SIZE * view.zoom));
        const dy = Math.round((ev.clientY - dragStart.current.my) / (GRID_SIZE * view.zoom));
        moveRoom(room.id, {
          x: dragStart.current.rx + dx,
          y: dragStart.current.ry + dy,
        });
      };
      const onUp = () => {
        dragging.current = false;
        setIsDragging(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [editorMode, room, view.zoom, selectRoom, deleteRoom, moveRoom]
  );

  // Shape paths (used for accessibility/debugging purposes, currently rendered as individual rects)

  const fillColor =
    room.piece.shape === 'corridor'
      ? '#e0e7ff'
      : room.piece.shape === 'l-shape'
      ? '#d1fae5'
      : '#dbeafe';

  const strokeColor = isSelected ? '#2563eb' : GRID_LINE_COLOR;
  const strokeWidth = isSelected ? 2.5 : GRID_LINE_WIDTH;

  return (
    <g
      onMouseDown={onMouseDown}
      style={{ cursor: editorMode === 'delete' ? 'not-allowed' : isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Room cells */}
      {cells.map(c => {
        const openMask = openings.get(`${c.x},${c.y}`) ?? 0;
        if (openMask) return (
          <g key={`${c.x}-${c.y}`} data-room-opening={openMask}>
            <rect x={c.x * GRID_SIZE} y={c.y * GRID_SIZE} width={GRID_SIZE} height={GRID_SIZE} fill={fillColor} />
            <path d={corridorWalls({ ...c, connections: openMask }).map(wall =>
              `M ${wall.x1 * GRID_SIZE} ${wall.y1 * GRID_SIZE} L ${wall.x2 * GRID_SIZE} ${wall.y2 * GRID_SIZE}`).join(' ')}
              fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          </g>
        );
        return (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * GRID_SIZE}
          y={c.y * GRID_SIZE}
          width={GRID_SIZE}
          height={GRID_SIZE}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        );
      })}

      <RoomLabel room={room} cells={cells} visibility={roomLabels} color={strokeColor} />

      {/* Connectors */}
      {editorMode !== 'connect' && connectors.map(con => {
        const point = connectorPoint(con);

        const conColor =
          con.kind === 'door'   ? '#f59e0b' :
          con.kind === 'secret' ? '#7c3aed' :
          con.kind === 'locked' ? '#dc2626' :
          '#10b981';

        return (
          <circle
            key={con.id}
            cx={point.x * GRID_SIZE}
            cy={point.y * GRID_SIZE}
            r={GRID_SIZE * 0.12}
            fill={conColor}
            stroke="white"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* Selection highlight border around bounding box */}
      {isSelected && (() => {
        const minX = Math.min(...cells.map(c => c.x));
        const minY = Math.min(...cells.map(c => c.y));
        const maxX = Math.max(...cells.map(c => c.x));
        const maxY = Math.max(...cells.map(c => c.y));
        return (
          <rect
            x={minX * GRID_SIZE - 2}
            y={minY * GRID_SIZE - 2}
            width={(maxX - minX + 1) * GRID_SIZE + 4}
            height={(maxY - minY + 1) * GRID_SIZE + 4}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6,3"
            style={{ pointerEvents: 'none' }}
          />
        );
      })()}
    </g>
  );
}
