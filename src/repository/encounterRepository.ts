import { v4 as uuid } from 'uuid';
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
const conflict = () => new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
// Monotonic persisted timestamps also act as optimistic concurrency tokens.
function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function createEncounterRepository(database: DungeonDB = db, notify = publishEncounterLibraryUpdate): EncounterRepository {
  return {
    async list() { return (await database.encounterTemplates.orderBy('name').toArray()).map(normalizeEncounterTemplate); },
    async get(id) { const value = await database.encounterTemplates.get(id); return value ? normalizeEncounterTemplate(value) : undefined; },
    async save(value, expectedUpdatedAt) {
      const draft = normalizeEncounterDraft(value);
      const saved = await database.transaction('rw', database.encounterTemplates, async () => {
        const existing = await database.encounterTemplates.get(draft.id);
        if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw conflict();
        const now = nextTimestamp(existing?.updatedAt);
        const theme = normalizeEncounterTemplate({ ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now });
        await database.encounterTemplates.put(theme);
        return theme;
      });
      notify(); return saved;
    },
    async delete(id, expectedUpdatedAt) {
      await database.transaction('rw', database.encounterTemplates, async () => {
        const existing = await database.encounterTemplates.get(id);
        if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
        await database.encounterTemplates.delete(id);
      });
      notify();
    },
    async saveMany(values, policy) {
      const themes = checkedEncounterBatch(values);
      if (policy !== 'skip' && policy !== 'new-id') throw new Error('ID衝突時の処理を選択してください。');
      const report = await database.transaction('rw', database.encounterTemplates, async () => {
        const report: EncounterImportReport = { added: 0, reused: 0, skipped: 0, reidentified: 0 };
        const reserved = new Set(themes.map(c => c.id));
        for (const theme of themes) {
          const existing = await database.encounterTemplates.get(theme.id);
          if (!existing) { await database.encounterTemplates.add(theme); report.added++; }
          else if (sameEncounterTemplate(existing, theme)) report.reused++;
          else if (policy === 'skip') report.skipped++;
          else {
            let id: string;
            do { id = uuid(); } while (reserved.has(id) || await database.encounterTemplates.get(id));
            reserved.add(id);
            const now = nextTimestamp();
            await database.encounterTemplates.add({ ...theme, id, createdAt: now, updatedAt: now });
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
export const encounterRepository = createEncounterRepository();
