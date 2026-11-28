import type {FactionOverlay} from '../factions/factionOverlay';
import {FactionCellOverlay} from '../components/factions/FactionOverlay';
import { renderToStaticMarkup } from 'react-dom/server';
import { GRID_LINE_COLOR, GRID_LINE_WIDTH, GRID_SIZE } from '../editor/grid';
import { RoomLabel } from '../components/pieces/RoomLabel';
import { mapBounds, outputDimensions } from './mapBounds';
import type { PublishMapGeometry } from './publishMapGeometry';
import type { PublishProfile } from './publishProfile';

export function renderPublishSvg(geometry: PublishMapGeometry, profile: PublishProfile, factionData?:FactionOverlay) {
  if (geometry.document.audience !== profile.audience) throw new Error('出力対象と描画データが一致しません。');
  const overlay=profile.audience==='gm'&&profile.showFactions?factionData:undefined;
  const bounds = mapBounds(geometry, profile.paddingCells);
  const legendY=bounds.maxY*GRID_SIZE;
  const legend=overlay?[...overlay.legend.map(f=>({name:f.name,color:f.color})),{name:'係争: 複数色 / 無所属: 通常色',color:'#64748B'}]:[];
  if(overlay?.legend.some(f=>!/^#[0-9a-f]{6}$/i.test(f.color)))throw new Error('勢力の色が不正です。');
  if(overlay){bounds.maxY+=legend.length*0.6+0.7;bounds.maxX=Math.max(bounds.maxX,bounds.minX+Math.max(12,...legend.map(f=>Array.from(f.name).length*0.36+2)));}
  const dimensions=outputDimensions(bounds,profile);
  const x = bounds.minX * GRID_SIZE, y = bounds.minY * GRID_SIZE;
  const w = (bounds.maxX - bounds.minX) * GRID_SIZE, h = (bounds.maxY - bounds.minY) * GRID_SIZE;
  const shapes = [geometry.corridor, ...geometry.rooms.map(r => r.shapes)];
  // Room openings and corridor borders can refer to the same physical edge.
  const grid = [...new Set(shapes.flatMap(s => s.grid.split(/(?=M )/).map(v => v.trim()).filter(Boolean)))].join(' ');
  const walls = [...new Set(shapes.flatMap(s => s.walls.map(wall => wall.d)))].join(' ');
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={dimensions.width} height={dimensions.height}
      viewBox={`${x} ${y} ${w} ${h}`} fontFamily="sans-serif">
      {profile.background === 'white' && <rect x={x} y={y} width={w} height={h} fill="white" />}
      <path d={geometry.corridor.floors.map(f => f.d).join(' ')} fill="#e0e7ff" />
      {geometry.rooms.map(({ room, shapes }) => <path key={room.id} d={shapes.floors.map(f => f.d).join(' ')} fill="#e0e7ff" />)}
      {overlay&&<FactionCellOverlay rooms={overlay.rooms} />}
      {profile.showGrid && grid && <path d={grid} fill="none" stroke={GRID_LINE_COLOR} strokeWidth={GRID_LINE_WIDTH} />}
      {walls && <path d={walls} fill="none" stroke={GRID_LINE_COLOR} strokeWidth={2} strokeLinejoin="round" />}
      {geometry.overlays.map((overlay, i) => overlay.points.length === 1
        ? <circle key={i} cx={overlay.points[0].x * GRID_SIZE} cy={overlay.points[0].y * GRID_SIZE}
          r={GRID_SIZE * 0.14} fill="white" stroke={overlay.color} strokeWidth={2} />
        : <path key={i} d={overlay.points.map((p, j) => `${j ? 'L' : 'M'} ${p.x * GRID_SIZE} ${p.y * GRID_SIZE}`).join(' ')}
          fill="none" stroke={overlay.color} strokeWidth={3} strokeLinejoin="round"
          strokeDasharray={overlay.type === 'secret' ? '6 4' : undefined} />)}
      {geometry.rooms.map(({ room, cells }) => <RoomLabel key={room.id} room={room} cells={cells}
        visibility={{ numbers: profile.showRoomNumbers, names: profile.showRoomNames }} color="#334155" publication />)}
      {overlay&&<g pointerEvents="none">{legend.map((f,i)=><g key={i}><rect x={x+8} y={legendY+12+i*24} width={12} height={12} fill={f.color} /><text x={x+28} y={legendY+23+i*24} fontSize={14} fill="#334155">{f.name}</text></g>)}</g>}
    </svg>);
  return { svg, bounds, ...dimensions };
}
