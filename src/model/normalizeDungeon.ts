import type { DungeonDocument } from './types';

type DungeonDocumentInput = Omit<DungeonDocument, 'markdown'> & {
  markdown?: string;
};

export function normalizeDungeonDocument(dungeon: DungeonDocumentInput): DungeonDocument {
  return {
    ...dungeon,
    markdown: dungeon.markdown ?? '',
  };
}
