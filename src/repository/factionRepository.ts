import { v4 as uuid } from 'uuid';
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
const conflict = () => new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
// Monotonic persisted timestamps also act as optimistic concurrency tokens.
function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function createFactionRepository(database: DungeonDB = db, notify = publishFactionLibraryUpdate): FactionRepository {
  return {
    async list() { return (await database.factionDefinitions.orderBy('name').toArray()).map(normalizeFaction); },
    async get(id) { const value = await database.factionDefinitions.get(id); return value ? normalizeFaction(value) : undefined; },
    async save(value, expectedUpdatedAt) {
      const draft = normalizeFactionDraft(value);
      const saved = await database.transaction('rw', database.factionDefinitions, async () => {
        const existing = await database.factionDefinitions.get(draft.id);
        if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw conflict();
        const now = nextTimestamp(existing?.updatedAt);
        const theme = normalizeFaction({ ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now });
        await database.factionDefinitions.put(theme);
        return theme;
      });
      notify(); return saved;
    },
    async delete(id, expectedUpdatedAt) {
      await database.transaction('rw', database.factionDefinitions, async () => {
        const existing = await database.factionDefinitions.get(id);
        if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
        await database.factionDefinitions.delete(id);
      });
      notify();
    },
    async saveMany(values, policy) {
      const themes = checkedFactionBatch(values);
      if (policy !== 'skip' && policy !== 'new-id') throw new Error('ID衝突時の処理を選択してください。');
      const report = await database.transaction('rw', database.factionDefinitions, async () => {
        const report: FactionImportReport = { added: 0, reused: 0, skipped: 0, reidentified: 0 };
        const reserved = new Set(themes.map(c => c.id));
        for (const theme of themes) {
          const existing = await database.factionDefinitions.get(theme.id);
          if (!existing) { await database.factionDefinitions.add(theme); report.added++; }
          else if (sameFaction(existing, theme)) report.reused++;
          else if (policy === 'skip') report.skipped++;
          else {
            let id: string;
            do { id = uuid(); } while (reserved.has(id) || await database.factionDefinitions.get(id));
            reserved.add(id);
            const now = nextTimestamp();
            await database.factionDefinitions.add({ ...theme, id, createdAt: now, updatedAt: now });
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
export const factionRepository = createFactionRepository();
