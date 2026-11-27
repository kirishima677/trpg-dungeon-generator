import { v4 as uuid } from 'uuid';
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
const conflict = () => new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
// Monotonic persisted timestamps also act as optimistic concurrency tokens.
function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function createContentRepository(database: DungeonDB = db, notify = publishContentLibraryUpdate): ContentRepository {
  return {
    async list() { return (await database.contentDefinitions.orderBy('name').toArray()).map(normalizeContent); },
    async get(id) { const value = await database.contentDefinitions.get(id); return value ? normalizeContent(value) : undefined; },
    async save(value, expectedUpdatedAt) {
      const draft = normalizeContentDraft(value);
      const saved = await database.transaction('rw', database.contentDefinitions, async () => {
        const existing = await database.contentDefinitions.get(draft.id);
        if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw conflict();
        const now = nextTimestamp(existing?.updatedAt);
        const content = normalizeContent({ ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now });
        await database.contentDefinitions.put(content);
        return content;
      });
      notify(); return saved;
    },
    async delete(id, expectedUpdatedAt) {
      await database.transaction('rw', database.contentDefinitions, async () => {
        const existing = await database.contentDefinitions.get(id);
        if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
        await database.contentDefinitions.delete(id);
      });
      notify();
    },
    async saveMany(values, policy) {
      const contents = checkedContentBatch(values);
      if (policy !== 'skip' && policy !== 'new-id') throw new Error('ID衝突時の処理を選択してください。');
      const report = await database.transaction('rw', database.contentDefinitions, async () => {
        const report: ContentImportReport = { added: 0, reused: 0, skipped: 0, reidentified: 0 };
        const reserved = new Set(contents.map(c => c.id));
        for (const content of contents) {
          const existing = await database.contentDefinitions.get(content.id);
          if (!existing) { await database.contentDefinitions.add(content); report.added++; }
          else if (sameContent(existing, content)) report.reused++;
          else if (policy === 'skip') report.skipped++;
          else {
            let id: string;
            do { id = uuid(); } while (reserved.has(id) || await database.contentDefinitions.get(id));
            reserved.add(id);
            const now = nextTimestamp();
            await database.contentDefinitions.add({ ...content, id, createdAt: now, updatedAt: now });
            report.added++; report.reidentified++;
          }
        }
        return report;
      });
      if (report.added) notify();
      return report;
    },
  };
}
export const contentRepository = createContentRepository();
