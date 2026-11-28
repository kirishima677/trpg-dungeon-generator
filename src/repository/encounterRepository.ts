import {createDefinitionRepository} from './definitionRepository';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { EncounterTemplate, EncounterTemplateDraft } from '../model/encounter/template';
import { normalizeEncounterTemplate, normalizeEncounterDraft, sameEncounterTemplate } from '../model/encounter/template';
import { checkedEncounterBatch } from '../encounters/encounterJson';
import { publishEncounterLibraryUpdate } from '../encounters/encounterEvents';

export type EncounterCollisionPolicy = 'skip' | 'new-id';
export interface EncounterImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface EncounterRepository {
  list(): Promise<EncounterTemplate[]>;
  get(id: string): Promise<EncounterTemplate | undefined>;
  save(draft: EncounterTemplateDraft, expectedUpdatedAt: string | null): Promise<EncounterTemplate>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(themes: EncounterTemplate[], policy: EncounterCollisionPolicy): Promise<EncounterImportReport>;
}
export function createEncounterRepository(database: DungeonDB = db, notify = publishEncounterLibraryUpdate): EncounterRepository {
  return createDefinitionRepository({database,table:database.encounterTemplates,normalizeDraft:normalizeEncounterDraft,normalize:normalizeEncounterTemplate,same:sameEncounterTemplate,checkedBatch:checkedEncounterBatch,notify});
}
export const encounterRepository = createEncounterRepository();
