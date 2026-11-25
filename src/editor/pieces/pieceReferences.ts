import { PIECE_CHANNEL } from './pieceEvents';
import type { DungeonDocument, Piece } from '../../model/types';

const INTEGRITY_LOCK = 'trpg-piece-reference-check';
const SESSION_PREFIX = 'trpg-dungeon-editor-session:';
let frozen = 0;
export const pieceReferencesFrozen = () => frozen > 0;

export function collectPieceReferences(documents: readonly DungeonDocument[], pending: Piece | null): string[] {
  return [...new Set(documents.flatMap(d => d.rooms.map(r => r.pieceId)).concat(pending ? [pending.id] : []))];
}

export function withPieceLibraryRead<T>(read: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(INTEGRITY_LOCK, { mode: 'shared' }, read) : read();
}

/** A live window advertises itself with a browser-owned lock, released on crash. */
export async function registerPieceReferenceReader(read: () => string[]): Promise<() => void> {
  if (!navigator.locks || typeof BroadcastChannel === 'undefined') return () => {};
  let release!: () => void;
  const lifetime = new Promise<void>(resolve => { release = resolve; });
  const sessionId = crypto.randomUUID(), channel = new BroadcastChannel(PIECE_CHANNEL);
  channel.onmessage = event => {
    const data = event.data;
    if (data?.type !== 'PIECE_REFERENCES_REQUEST' || typeof data.requestId !== 'string') return;
    frozen++;
    // Remain frozen until the exclusive check ends, even if its owner crashes.
    void navigator.locks.request(INTEGRITY_LOCK, { mode: 'shared' }, () => { frozen--; });
    try { channel.postMessage({ type: 'PIECE_REFERENCES_REPLY', requestId: data.requestId, sessionId, ids: read() }); }
    catch { /* No reply means the check will fail closed. */ }
  };
  await navigator.locks.request(INTEGRITY_LOCK, async () => {
    await new Promise<void>(ready => {
      void navigator.locks.request(`${SESSION_PREFIX}${sessionId}`, async () => { ready(); await lifetime; });
    });
  });
  return () => { channel.close(); release(); };
}

export type PieceReferenceGuard = <T>(work: (liveIds: ReadonlySet<string>) => Promise<T>) => Promise<T>;

/** Pause known editor windows while checking references; missing replies fail closed. */
export const withPieceReferenceCheck: PieceReferenceGuard = async work => {
  if (typeof navigator === 'undefined' || !navigator.locks || typeof BroadcastChannel === 'undefined') {
    throw new Error('開いている編集画面の参照を安全に確認できないため、削除できません。');
  }
  return navigator.locks.request(INTEGRITY_LOCK, async () => {
    const snapshot = await navigator.locks.query();
    if (!snapshot.held) throw new Error('編集画面の一覧を確認できないため削除できません。');
    const sessions = new Set(snapshot.held.filter(l => l.name?.startsWith(SESSION_PREFIX)).map(l => l.name!.slice(SESSION_PREFIX.length)));
    const channel = new BroadcastChannel(PIECE_CHANNEL), requestId = crypto.randomUUID();
    try {
      const ids = await new Promise<Set<string>>((resolve, reject) => {
        if (sessions.size === 0) { resolve(new Set()); return; }
        const found = new Set<string>();
        const timeout = setTimeout(() => reject(new Error('編集画面から参照確認の応答がありません。削除を中止しました。')), 2500);
        channel.onmessage = event => {
          const data = event.data;
          if (data?.type !== 'PIECE_REFERENCES_REPLY' || data.requestId !== requestId || !sessions.has(data.sessionId)
            || !Array.isArray(data.ids) || !data.ids.every((id: unknown) => typeof id === 'string')) return;
          data.ids.forEach((id: string) => found.add(id));
          sessions.delete(data.sessionId);
          if (sessions.size === 0) { clearTimeout(timeout); resolve(found); }
        };
        channel.postMessage({ type: 'PIECE_REFERENCES_REQUEST', requestId });
      });
      return await work(ids);
    } finally { channel.close(); }
  });
};
