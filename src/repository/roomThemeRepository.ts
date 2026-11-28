import {createDefinitionRepository} from './definitionRepository';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { RoomTheme, RoomThemeDraft } from '../model/roomTheme';
import { normalizeRoomTheme, normalizeRoomThemeDraft, sameRoomTheme } from '../model/roomTheme';
import { checkedRoomThemeBatch } from '../themes/roomThemeJson';
import { publishRoomThemeLibraryUpdate } from '../themes/roomThemeEvents';

export type RoomThemeCollisionPolicy = 'skip' | 'new-id';
export interface RoomThemeImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface RoomThemeRepository {
  list(): Promise<RoomTheme[]>;
  get(id: string): Promise<RoomTheme | undefined>;
  save(draft: RoomThemeDraft, expectedUpdatedAt: string | null): Promise<RoomTheme>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(themes: RoomTheme[], policy: RoomThemeCollisionPolicy): Promise<RoomThemeImportReport>;
}
export function createRoomThemeRepository(database: DungeonDB = db, notify = publishRoomThemeLibraryUpdate): RoomThemeRepository {
  return createDefinitionRepository({database,table:database.roomThemes,normalizeDraft:normalizeRoomThemeDraft,normalize:normalizeRoomTheme,same:sameRoomTheme,checkedBatch:checkedRoomThemeBatch,notify});
}
export const roomThemeRepository = createRoomThemeRepository();
