import { db } from '../db';
import { normalizeDungeonDocument } from '../model';
import type { DungeonDocument } from '../model/types';

export const dungeonRepository = {
  async save(dungeon: DungeonDocument): Promise<void> {
    await db.dungeons.put(normalizeDungeonDocument(dungeon));
  },

  async saveMainEditorSnapshot(dungeon: DungeonDocument): Promise<void> {
    const normalized = normalizeDungeonDocument(dungeon);
    const updated = await db.dungeons.update(normalized.id, {
      name: normalized.name,
      version: normalized.version,
      rooms: normalized.rooms,
      meta: normalized.meta,
      updatedAt: normalized.updatedAt,
    });
    if (updated === 0) {
      await db.dungeons.put(normalized);
    }
  },

  async saveMarkdown(id: string, markdown: string, updatedAt: string): Promise<void> {
    const updated = await db.dungeons.update(id, { markdown, updatedAt });
    if (updated === 0) {
      const existing = await db.dungeons.get(id);
      if (!existing) {
        throw new Error(`Cannot save markdown: dungeon with id ${id} not found`);
      }
      await db.dungeons.put(normalizeDungeonDocument({
        ...existing,
        markdown,
        updatedAt,
      }));
    }
  },

  async load(id: string): Promise<DungeonDocument | undefined> {
    const dungeon = await db.dungeons.get(id);
    return dungeon ? normalizeDungeonDocument(dungeon) : undefined;
  },

  async list(): Promise<DungeonDocument[]> {
    const dungeons = await db.dungeons.orderBy('updatedAt').reverse().toArray();
    return dungeons.map(normalizeDungeonDocument);
  },

  async delete(id: string): Promise<void> {
    await db.dungeons.delete(id);
  },

  async saveAll(dungeons: DungeonDocument[]): Promise<void> {
    await db.dungeons.bulkPut(dungeons.map(normalizeDungeonDocument));
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
