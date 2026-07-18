import { db } from '../db';
import { normalizeDungeonDocument } from '../model';
import type { DungeonDocument } from '../model/types';

export const dungeonRepository = {
  async save(dungeon: DungeonDocument): Promise<void> {
    await db.dungeons.put(normalizeDungeonDocument(dungeon));
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
