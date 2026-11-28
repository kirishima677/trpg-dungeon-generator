import type { DungeonDocument } from '../model/types';
import { getWorldCells } from '../utils/geometry';
import { factionDisplayName } from '../model/factionState';
export interface FactionOverlayRoom {cells:{x:number;y:number}[];colors:string[]}
export interface FactionOverlay {rooms:FactionOverlayRoom[];legend:{name:string;color:string}[]}
/** Explicit GM-only projection; no faction IDs reach SVG. */
export function buildFactionOverlay(dungeon:DungeonDocument):FactionOverlay {
  const colors=new Map(dungeon.factions.map(f=>[f.id,f.mapColor]));
  const safe=(color:string|undefined)=>{if(!color||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('勢力の色が不正です。');return color;};
  return {rooms:dungeon.roomFactionAssignments.filter(a=>a.status!=='unclaimed').map(a=>{
    const room=dungeon.rooms.find(r=>r.id===a.roomId);if(!room)throw new Error('支配対象の部屋が見つかりません。');
    return {cells:getWorldCells(room),colors:(a.status==='controlled'?[a.controllingFactionId!]:a.contestingFactionIds).map(id=>safe(colors.get(id)))};
  }),legend:dungeon.factions.map(f=>({name:factionDisplayName(f),color:safe(f.mapColor)}))};
}
