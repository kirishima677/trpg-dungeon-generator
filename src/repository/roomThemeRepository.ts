import { v4 as uuid } from 'uuid';
import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { RoomTheme, RoomThemeDraft } from '../model/roomTheme';
import { normalizeRoomTheme, normalizeRoomThemeDraft, sameRoomTheme } from '../model/roomTheme';
import { checkedRoomThemeBatch } from '../themes/roomThemeJson';
import { publishRoomThemeLibraryUpdate } from '../themes/roomThemeEvents';

export type RoomThemeCollisionPolicy = 'skip' | 'new-id';
export interface RoomThemeImportReport { added: number; reused: number; skipped: number; reidentified: number }
export interface RoomThemeRepository {
  list(): Promise<RoomTheme[]>;
  get(id: string): Promise<RoomTheme | undefined>;
  save(draft: RoomThemeDraft, expectedUpdatedAt: string | null): Promise<RoomTheme>;
  delete(id: string, expectedUpdatedAt: string): Promise<void>;
  saveMany(themes: RoomTheme[], policy: RoomThemeCollisionPolicy): Promise<RoomThemeImportReport>;
}
const conflict = () => new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
// Monotonic persisted timestamps also act as optimistic concurrency tokens.
function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export function createRoomThemeRepository(database: DungeonDB = db, notify = publishRoomThemeLibraryUpdate): RoomThemeRepository {
  return {
    async list() { return (await database.roomThemes.orderBy('name').toArray()).map(normalizeRoomTheme); },
    async get(id) { const value = await database.roomThemes.get(id); return value ? normalizeRoomTheme(value) : undefined; },
    async save(value, expectedUpdatedAt) {
      const draft = normalizeRoomThemeDraft(value);
      const saved = await database.transaction('rw', database.roomThemes, async () => {
        const existing = await database.roomThemes.get(draft.id);
        if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) throw conflict();
        const now = nextTimestamp(existing?.updatedAt);
        const theme = normalizeRoomTheme({ ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now });
        await database.roomThemes.put(theme);
        return theme;
      });
      notify(); return saved;
    },
    async delete(id, expectedUpdatedAt) {
      await database.transaction('rw', database.roomThemes, async () => {
        const existing = await database.roomThemes.get(id);
        if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
        await database.roomThemes.delete(id);
      });
      notify();
    },
    async saveMany(values, policy) {
      const themes = checkedRoomThemeBatch(values);
      if (policy !== 'skip' && policy !== 'new-id') throw new Error('ID衝突時の処理を選択してください。');
      const report = await database.transaction('rw', database.roomThemes, async () => {
        const report: RoomThemeImportReport = { added: 0, reused: 0, skipped: 0, reidentified: 0 };
        const reserved = new Set(themes.map(c => c.id));
        for (const theme of themes) {
          const existing = await database.roomThemes.get(theme.id);
          if (!existing) { await database.roomThemes.add(theme); report.added++; }
          else if (sameRoomTheme(existing, theme)) report.reused++;
          else if (policy === 'skip') report.skipped++;
          else {
            let id: string;
            do { id = uuid(); } while (reserved.has(id) || await database.roomThemes.get(id));
            reserved.add(id);
            const now = nextTimestamp();
            await database.roomThemes.add({ ...theme, id, createdAt: now, updatedAt: now });
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
export const roomThemeRepository = createRoomThemeRepository();
