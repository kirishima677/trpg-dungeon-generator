import {createDefinitionRepository} from './definitionRepository';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { FactionDefinition, FactionDraft } from '../model/faction';
import { normalizeFaction, normalizeFactionDraft, sameFaction } from '../model/faction';
import { checkedFactionBatch } from '../factions/factionJson';
import { publishFactionLibraryUpdate } from '../factions/factionEvents';

export type FactionCollisionPolicy = 'skip' | 'new-id';
export interface FactionImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface FactionRepository {
  list(): Promise<FactionDefinition[]>;
  get(id: string): Promise<FactionDefinition | undefined>;
  save(draft: FactionDraft, expectedUpdatedAt: string | null): Promise<FactionDefinition>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(themes: FactionDefinition[], policy: FactionCollisionPolicy): Promise<FactionImportReport>;
}
export function createFactionRepository(database: DungeonDB = db, notify = publishFactionLibraryUpdate): FactionRepository {
  return createDefinitionRepository({database,table:database.factionDefinitions,normalizeDraft:normalizeFactionDraft,normalize:normalizeFaction,same:sameFaction,checkedBatch:checkedFactionBatch,notify});
}
export const factionRepository = createFactionRepository();
