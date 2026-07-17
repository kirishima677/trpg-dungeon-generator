import { db } from '../db';
import type { DungeonDocument } from '../model/types';

export const dungeonRepository = {
  async save(dungeon: DungeonDocument): Promise<void> {
    await db.dungeons.put(dungeon);
  },

  async load(id: string): Promise<DungeonDocument | undefined> {
    return db.dungeons.get(id);
  },

  async list(): Promise<DungeonDocument[]> {
    return db.dungeons.orderBy('updatedAt').reverse().toArray();
  },

  async delete(id: string): Promise<void> {
    await db.dungeons.delete(id);
  },

  async saveAll(dungeons: DungeonDocument[]): Promise<void> {
    await db.dungeons.bulkPut(dungeons);
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
