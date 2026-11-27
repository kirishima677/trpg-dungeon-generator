import { v4 as uuid } from 'uuid';
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
const conflict = () => new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
// Monotonic persisted timestamps also act as optimistic concurrency tokens.
function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function createThemeRepository(database: DungeonDB = db, notify = publishThemeLibraryUpdate): ThemeRepository {
  return {
    async list() { return (await database.dungeonThemes.orderBy('name').toArray()).map(normalizeTheme); },
    async get(id) { const value = await database.dungeonThemes.get(id); return value ? normalizeTheme(value) : undefined; },
    async save(value, expectedUpdatedAt) {
      const draft = normalizeThemeDraft(value);
      const saved = await database.transaction('rw', database.dungeonThemes, async () => {
        const existing = await database.dungeonThemes.get(draft.id);
        if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw conflict();
        const now = nextTimestamp(existing?.updatedAt);
        const theme = normalizeTheme({ ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now });
        await database.dungeonThemes.put(theme);
        return theme;
      });
      notify(); return saved;
    },
    async delete(id, expectedUpdatedAt) {
      await database.transaction('rw', database.dungeonThemes, async () => {
        const existing = await database.dungeonThemes.get(id);
        if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
        await database.dungeonThemes.delete(id);
      });
      notify();
    },
    async saveMany(values, policy) {
      const themes = checkedThemeBatch(values);
      if (policy !== 'skip' && policy !== 'new-id') throw new Error('ID衝突時の処理を選択してください。');
      const report = await database.transaction('rw', database.dungeonThemes, async () => {
        const report: ThemeImportReport = { added: 0, reused: 0, skipped: 0, reidentified: 0 };
        const reserved = new Set(themes.map(c => c.id));
        for (const theme of themes) {
          const existing = await database.dungeonThemes.get(theme.id);
          if (!existing) { await database.dungeonThemes.add(theme); report.added++; }
          else if (sameTheme(existing, theme)) report.reused++;
          else if (policy === 'skip') report.skipped++;
          else {
            let id: string;
            do { id = uuid(); } while (reserved.has(id) || await database.dungeonThemes.get(id));
            reserved.add(id);
            const now = nextTimestamp();
            await database.dungeonThemes.add({ ...theme, id, createdAt: now, updatedAt: now });
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
export const themeRepository = createThemeRepository();
