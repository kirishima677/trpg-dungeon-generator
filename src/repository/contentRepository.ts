import {createDefinitionRepository} from './definitionRepository';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { ContentDefinition, ContentDraft } from '../model/content';
import { normalizeContent, normalizeContentDraft, sameContent } from '../model/content';
import { checkedContentBatch } from '../content/contentJson';
import { publishContentLibraryUpdate } from '../content/contentEvents';

export type ContentCollisionPolicy = 'skip' | 'new-id';
export interface ContentImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface ContentRepository {
  list(): Promise<ContentDefinition[]>;
  get(id: string): Promise<ContentDefinition | undefined>;
  save(draft: ContentDraft, expectedUpdatedAt: string | null): Promise<ContentDefinition>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(contents: ContentDefinition[], policy: ContentCollisionPolicy): Promise<ContentImportReport>;
}
export function createContentRepository(database: DungeonDB = db, notify = publishContentLibraryUpdate): ContentRepository {
  return createDefinitionRepository({database,table:database.contentDefinitions,normalizeDraft:normalizeContentDraft,normalize:normalizeContent,same:sameContent,checkedBatch:checkedContentBatch,notify});
}
export const contentRepository = createContentRepository();
