import type { PlacedRoomInput } from '../../model/types';
import { roomDisplayName } from '../../model/roomInformation';
import { roomLabelLayout } from '../../editor/rooms/roomLabel';
import type { RoomLabelVisibility } from '../../editor/rooms/roomLabel';
import { GRID_SIZE } from '../../editor/grid';

export function RoomLabel({ room, cells, visibility, color }: {
  room: PlacedRoomInput; cells: readonly { x: number; y: number }[];
  visibility: RoomLabelVisibility; color: string;
}) {
  const layout = roomLabelLayout(cells);
  if (!layout) return null;
  const number = visibility.numbers ? room.information?.number : '';
  const name = visibility.names ? roomDisplayName(room) : '';
  if (!number && !name) return null;
  const draw = (value: string, kind: 'number' | 'name', offset: number, fontSize: number) => {
    const width = Math.min(layout.width * GRID_SIZE - 8, [...value].length * fontSize);
    return <text data-room-number={kind === 'number' ? room.id : undefined} data-room-name={kind === 'name' ? room.id : undefined}
      x={layout.x * GRID_SIZE} y={layout.y * GRID_SIZE + offset} textAnchor="middle" dominantBaseline="middle"
      fontSize={fontSize} fontWeight={kind === 'number' ? 700 : 400} textLength={width} lengthAdjust="spacingAndGlyphs"
      fill={color} stroke="white" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{value}</text>;
  };
  return <g data-room-label={room.id} pointerEvents="none" style={{ userSelect: 'none' }}>
    <title>{[number, name].filter(Boolean).join(' ')}</title>
    {number && draw(number, 'number', name ? -7 : 0, GRID_SIZE * 0.35)}
    {name && draw(name, 'name', number ? 8 : 0, GRID_SIZE * 0.26)}
  </g>;
}
