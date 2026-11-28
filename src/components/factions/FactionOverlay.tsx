import type { FactionOverlayRoom } from '../../factions/factionOverlay';
import {GRID_SIZE} from '../../editor/grid';
export function FactionCellOverlay({rooms}:{rooms:readonly FactionOverlayRoom[]}) {
  return <g pointerEvents="none" aria-hidden="true">{rooms.flatMap((room,ri)=>room.cells.flatMap((cell,ci)=>room.colors.map((color,i)=>{
    if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error('勢力の色が不正です。');
    return <rect key={`${ri}-${ci}-${i}`} x={cell.x*GRID_SIZE+1+(GRID_SIZE-2)*i/room.colors.length} y={cell.y*GRID_SIZE+1} width={(GRID_SIZE-2)/room.colors.length} height={GRID_SIZE-2} fill={color} opacity={0.3} />;
  })))}</g>;
}
