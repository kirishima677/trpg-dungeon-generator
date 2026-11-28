import { db } from '../db';
import { assertDungeonDocument } from '../model/dungeonValidation';
import type { DungeonDocument } from '../model/types';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import { SCHEMA_VERSION } from '../model/dungeonSchema';

export const dungeonRepository = {
  async save(dungeon: DungeonDocument): Promise<void> {
    await db.dungeons.put(assertDungeonDocument(dungeon));
  },

  async saveMainEditorSnapshot(dungeon: DungeonDocumentInput): Promise<void> {
    await db.transaction('rw', db.dungeons, async () => {
      const existing = await db.dungeons.get(dungeon.id);
      // Older partial editor saves did not carry entities. Preserve the stored array and validate room references.
      const theme = Object.hasOwn(dungeon, 'theme') || dungeon.version === SCHEMA_VERSION ? dungeon.theme : existing?.theme;
      const rooms = dungeon.version === SCHEMA_VERSION ? dungeon.rooms : dungeon.rooms.map(room => Object.hasOwn(room, 'roomTheme') ? room : {
        ...room, roomTheme: existing?.rooms.find(r => r.id === room.id)?.roomTheme,
      });
      const legacy=dungeon.version!==SCHEMA_VERSION;
      const previousEntities=new Map(existing?.entities?.map(e=>[e.id,e]));
      const entities=(dungeon.entities??existing?.entities??[]).map(e=>{
        const previous=previousEntities.get(e.id);
        const entity=legacy&&!Object.hasOwn(e,'factionId')&&previous?.factionId?{...e,factionId:previous.factionId}:e;
        return legacy&&!Object.hasOwn(e,'origin')&&previous?.origin?.type==='encounter'?{...entity,origin:previous.origin}:entity;
      });
      const normalized = assertDungeonDocument({ ...dungeon, rooms, entities, theme,encounters:dungeon.encounters===undefined&&legacy?existing?.encounters?.filter(e=>rooms.some(r=>r.id===e.roomId)):dungeon.encounters,
        factions:dungeon.factions===undefined&&legacy?existing?.factions:dungeon.factions,factionRelations:dungeon.factionRelations===undefined&&legacy?existing?.factionRelations:dungeon.factionRelations,
        roomFactionAssignments:dungeon.roomFactionAssignments===undefined&&legacy?existing?.roomFactionAssignments?.filter(a=>rooms.some(r=>r.id===a.roomId)):dungeon.roomFactionAssignments });
      if (existing) await db.dungeons.update(normalized.id, {
        name: normalized.name,
        version: normalized.version,
        rooms: normalized.rooms,
        connections: normalized.connections,
        entities: normalized.entities,
        encounters:normalized.encounters,
        factions:normalized.factions,factionRelations:normalized.factionRelations,roomFactionAssignments:normalized.roomFactionAssignments,
        theme: normalized.theme,
        meta: normalized.meta,
        updatedAt: normalized.updatedAt,
      });
      else await db.dungeons.put(normalized);
    });
  },

  async saveMarkdown(id: string, markdown: string, updatedAt: string): Promise<void> {
    const updated = await db.dungeons.update(id, { markdown, updatedAt });
    if (updated === 0) {
      const existing = await db.dungeons.get(id);
      if (!existing) {
        throw new Error(`Cannot save markdown: dungeon with id ${id} not found. The dungeon may have been deleted.`);
      }
      await db.dungeons.put(assertDungeonDocument({
        ...existing,
        markdown,
        updatedAt,
      }));
    }
  },

  async load(id: string): Promise<DungeonDocument | undefined> {
    const dungeon = await db.dungeons.get(id);
    return dungeon ? assertDungeonDocument(dungeon) : undefined;
  },

  async list(): Promise<DungeonDocument[]> {
    const dungeons = await db.dungeons.orderBy('updatedAt').reverse().toArray();
    return dungeons.map(d=>assertDungeonDocument(d));
  },

  async delete(id: string): Promise<void> {
    await db.dungeons.delete(id);
  },

  async saveAll(dungeons: DungeonDocument[]): Promise<void> {
    await db.dungeons.bulkPut(dungeons.map(d => assertDungeonDocument(d)));
  },
};

export const settingsRepository = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await db.settings.get(key);
    return row?.value as T | undefined;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  },
};
