import { v4 as uuid } from 'uuid';
import { normalizeContent } from './content';
import type { ContentDefinition } from './content';

export type EntityVisibility = 'gm-only' | 'public';
export interface EntityInstance {
  id: string; roomId: string; sourceContentId: string; contentSnapshot: ContentDefinition;
  quantity: number; customName: string; publicDescription: string; gmNotes: string; visibility: EntityVisibility;
}
export type EntityEdits = Pick<EntityInstance, 'quantity' | 'customName' | 'publicDescription' | 'gmNotes' | 'visibility'>;
export const ENTITY_LIMITS = { perRoom: 50, total: 500, quantity: 1_000_000, name: 200, markdown: 20_000,
  snapshotBytes: 256 * 1024, totalBytes: 8 * 1024 * 1024, dungeonJsonBytes: 20 * 1024 * 1024 } as const;
function string(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${field}は${max}文字以内の${required ? '空ではない' : ''}文字列で指定してください。`);
  return value;
}
function snapshot(value: unknown): ContentDefinition {
  const content = normalizeContent(value);
  if (new TextEncoder().encode(JSON.stringify(content)).length > ENTITY_LIMITS.snapshotBytes) throw new Error('Content Snapshotは256 KiBまでです。');
  return content;
}
function edits(value: unknown): EntityEdits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entityの編集内容が不正です。');
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.quantity) || (raw.quantity as number) < 1 || (raw.quantity as number) > ENTITY_LIMITS.quantity) throw new Error(`数量は1〜${ENTITY_LIMITS.quantity}の整数で指定してください。`);
  if (raw.visibility !== 'gm-only' && raw.visibility !== 'public') throw new Error('Entityの公開範囲が不正です。');
  return { quantity: raw.quantity as number,
    customName: string(raw.customName, '個別名称', ENTITY_LIMITS.name), publicDescription: string(raw.publicDescription, '配置の公開説明', ENTITY_LIMITS.markdown),
    gmNotes: string(raw.gmNotes, '配置のGM専用情報', ENTITY_LIMITS.markdown), visibility: raw.visibility };
}
export function normalizeEntity(value: unknown, roomIds: ReadonlySet<string>): EntityInstance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entityの形式が不正です。');
  const raw = value as Record<string, unknown>;
  const id = string(raw.id, 'Entity ID', 128, true), roomId = string(raw.roomId, '所属部屋ID', 128, true);
  if (!roomIds.has(roomId)) throw new Error('Entityの所属部屋が見つかりません。');
  const sourceContentId = string(raw.sourceContentId, '元のContent ID', 128, true);
  const contentSnapshot = snapshot(raw.contentSnapshot);
  if (contentSnapshot.id !== sourceContentId) throw new Error('元のContent IDとスナップショットが一致しません。');
  return { id, roomId, sourceContentId, contentSnapshot, ...edits(raw) };
}
export function checkEntityLimits(entities: readonly EntityInstance[]) {
  if (entities.length > ENTITY_LIMITS.total) throw new Error(`Entityはダンジョン全体で${ENTITY_LIMITS.total}件までです。`);
  const counts = new Map<string, number>(), ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) throw new Error('Entity IDが重複しています。');
    ids.add(entity.id);
    const count = (counts.get(entity.roomId) ?? 0) + 1; counts.set(entity.roomId, count);
    if (count > ENTITY_LIMITS.perRoom) throw new Error(`Entityは1部屋に${ENTITY_LIMITS.perRoom}件までです。`);
  }
  if (new TextEncoder().encode(JSON.stringify(entities)).length > ENTITY_LIMITS.totalBytes) throw new Error('Entity一覧は合計8 MiBまでです。');
}
/** Missing arrays are the compatibility path for pre-Entity documents, never for malformed arrays. */
export function normalizeEntities(values: unknown, rooms: readonly { id: string }[]): EntityInstance[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > ENTITY_LIMITS.total) throw new Error(`Entity一覧は${ENTITY_LIMITS.total}件までの配列で指定してください。`);
  const ids = new Set<string>(), roomIds = new Set(rooms.map(r => r.id));
  const entities = values.map(value => {
    const entity = normalizeEntity(value, roomIds);
    if (ids.has(entity.id)) throw new Error('Entity IDが重複しています。');
    ids.add(entity.id); return entity;
  });
  checkEntityLimits(entities); return entities;
}
export function createEntityInstance(roomId: string, content: ContentDefinition, rooms: readonly { id: string }[], quantity = 1): EntityInstance {
  return normalizeEntity({ id: uuid(), roomId, sourceContentId: content.id, contentSnapshot: content,
    quantity, customName: '', publicDescription: '', gmNotes: '', visibility: 'gm-only' }, new Set(rooms.map(r => r.id)));
}
export const entityDisplayName = (entity: EntityInstance) => entity.customName.trim() || entity.contentSnapshot.name;

export type EntityCommand =
  | { type: 'add'; roomId: string; content: ContentDefinition; quantity: number }
  | { type: 'edit'; id: string; edits: EntityEdits }
  | { type: 'duplicate'; id: string }
  | { type: 'move'; id: string; roomId: string }
  | { type: 'delete'; id: string }
  | { type: 'refresh'; id: string; content: ContentDefinition };

/** Copy only the changed snapshot. Physical room/connection references stay outside this operation. */
export function applyEntityCommand(entities: readonly EntityInstance[], rooms: readonly { id: string }[], command: EntityCommand): EntityInstance[] | null {
  let result: EntityInstance[];
  if (command.type === 'add') result = [...entities, createEntityInstance(command.roomId, command.content, rooms, command.quantity)];
  else {
    const entity = entities.find(e => e.id === command.id);
    if (!entity) throw new Error('Entityが見つかりません。');
    if (command.type === 'delete') result = entities.filter(e => e.id !== entity.id);
    else if (command.type === 'duplicate') result = [...entities, normalizeEntity({ ...entity, id: uuid() }, new Set(rooms.map(r => r.id)))];
    else {
      if (command.type === 'refresh' && (command.content.id !== entity.sourceContentId || command.content.kind !== entity.contentSnapshot.kind)) throw new Error('元のIDまたは種別が異なります。Entityを再登録してください。');
      if (command.type === 'move' && !rooms.some(r => r.id === command.roomId)) throw new Error('Entityの所属部屋が見つかりません。');
      const next = { ...entity, ...(command.type === 'edit' ? edits(command.edits)
        : command.type === 'move' ? { roomId: string(command.roomId, '所属部屋ID', 128, true) } : { contentSnapshot: snapshot(command.content) }) };
      if (JSON.stringify(next) === JSON.stringify(entity)) return null;
      result = entities.map(e => e.id === entity.id ? next : e);
    }
  }
  checkEntityLimits(result); return result;
}
