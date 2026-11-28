import type { ContentDefinition } from './content';
import type { DungeonDocument, Piece } from './types';
import { createEntityInstance, normalizeEntity, checkEntityLimits } from './entity';
import type { EntityInstance } from './entity';
import { resolveRoomTheme } from './roomThemeResolver';
import { normalizeRoomTheme } from './roomTheme';

/** Build the entire proposed change before touching the Store. Each entry is one grouped Entity. */
export function prepareRequiredPlacement(dungeon: DungeonDocument, roomId: string, contents: readonly ContentDefinition[], pieces: readonly Piece[]) {
  const room = dungeon.rooms.find(r => r.id === roomId);
  if (!room?.roomTheme) throw new Error('Room Themeが設定された部屋を選択してください。');
  const theme = normalizeRoomTheme(room.roomTheme.themeSnapshot);
  const resolved = resolveRoomTheme({ dungeonTheme:dungeon.theme?.themeSnapshot,roomTheme:theme,pieces,contents });
  const added: EntityInstance[] = [], blockers: string[] = [];
  const entries = resolved.requiredContents.map(item => {
    const existing = dungeon.entities.filter(e => e.roomId === roomId && e.origin?.type==='room-theme-required'&&e.origin.sourceRoomThemeId === theme.id && e.origin.requiredEntryId === item.entry.id);
    if (item.status !== 'resolved') blockers.push(`必須項目「${item.entry.contentId}」が${item.status === 'missing' ? '未解決' : '種別不一致'}です。`);
    if (!existing.length && item.status === 'resolved') {
      try {
        const base = createEntityInstance(roomId,item.content!,dungeon.rooms,item.entry.quantity);
        added.push(normalizeEntity({ ...base, ...item.entry, id:base.id, roomId, sourceContentId:base.sourceContentId,
          origin:{type:'room-theme-required',sourceRoomThemeId:theme.id,requiredEntryId:item.entry.id} },new Set(dungeon.rooms.map(r => r.id))));
      } catch (e) { blockers.push((e as Error).message); }
    }
    const currentQuantity = existing.reduce((n,e) => n + e.quantity,0);
    return { ...item, existing, currentQuantity, quantityDifference:existing.length ? item.entry.quantity-currentQuantity : 0, action:existing.length ? 'skip' as const : 'add' as const };
  });
  try { checkEntityLimits([...dungeon.entities,...added]); } catch(e) { blockers.push((e as Error).message); }
  const conflicts = resolved.warnings.filter(w => w.code === 'required-conflict' || w.code === 'room-theme-excluded');
  return { entries, added, blockers, conflicts, warnings:resolved.warnings };
}
/** Material revision, applied policies and existing Entities must still match the reviewed plan. */
export function requiredPlacementRevision(dungeon: DungeonDocument, roomId: string, contents: readonly ContentDefinition[], pieces: readonly Piece[]) {
  const room = dungeon.rooms.find(r => r.id === roomId), ids = new Set(room?.roomTheme?.themeSnapshot.requiredContents.map(e => e.contentId) ?? []);
  return JSON.stringify([dungeon.id,roomId,room?.roomTheme,dungeon.theme,dungeon.entities,
    contents.filter(c => ids.has(c.id)).slice().sort((a,b) => a.id < b.id ? -1 : 1),pieces.map(p => [p.id,p.tags])]);
}
