import type { DungeonDocument } from '../model/types';

/** Read the committed Markdown without saving or replacing current unsaved rooms. */
export async function snapshotWithSavedMarkdown(document: DungeonDocument,
  load: (id: string) => Promise<DungeonDocument | undefined>): Promise<DungeonDocument> {
  const snapshot = structuredClone(document);
  const saved = await load(snapshot.id);
  if (saved && saved.id !== snapshot.id) throw new Error('Markdownの取得元が一致しません。');
  return saved ? { ...snapshot, markdown: saved.markdown } : snapshot;
}
