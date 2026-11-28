import {createDefinitionRepository} from './definitionRepository';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { DungeonTheme, DungeonThemeDraft } from '../model/dungeonTheme';
import { normalizeTheme, normalizeThemeDraft, sameTheme } from '../model/dungeonTheme';
import { checkedThemeBatch } from '../themes/themeJson';
import { publishThemeLibraryUpdate } from '../themes/themeEvents';

export type ThemeCollisionPolicy = 'skip' | 'new-id';
export interface ThemeImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface ThemeRepository {
  list(): Promise<DungeonTheme[]>;
  get(id: string): Promise<DungeonTheme | undefined>;
  save(draft: DungeonThemeDraft, expectedUpdatedAt: string | null): Promise<DungeonTheme>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(themes: DungeonTheme[], policy: ThemeCollisionPolicy): Promise<ThemeImportReport>;
}
export function createThemeRepository(database: DungeonDB = db, notify = publishThemeLibraryUpdate): ThemeRepository {
  return createDefinitionRepository({database,table:database.dungeonThemes,normalizeDraft:normalizeThemeDraft,normalize:normalizeTheme,same:sameTheme,checkedBatch:checkedThemeBatch,notify});
}
export const themeRepository = createThemeRepository();
