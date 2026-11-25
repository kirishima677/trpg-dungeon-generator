import type { DungeonDocument } from '../model/types';

export interface PublishSnapshot { dungeonId: string; token: string; document: DungeonDocument }
type Channel = Pick<BroadcastChannel, 'postMessage' | 'close' | 'onmessage'>;
export const snapshotChannelName = (token: string) => `dungeon-publishing-${token}`;

/** This channel holds only a fixed, in-memory launch snapshot; it never saves the project. */
export function createSnapshotProvider(token: string, dungeonId: string,
  channel: Channel = new BroadcastChannel(snapshotChannelName(token))) {
  let snapshot: PublishSnapshot | undefined;
  channel.onmessage = event => {
    const data = event.data;
    if (data?.type !== 'request' || data.token !== token || data.dungeonId !== dungeonId || !snapshot) return;
    channel.postMessage({ type: 'snapshot', ...snapshot });
  };
  return {
    capture(document: DungeonDocument) {
      if (document.id !== dungeonId) throw new Error('出版対象のダンジョンが一致しません。');
      snapshot = { token, dungeonId, document: structuredClone(document) };
      // Reopening an existing publication window is an explicit refresh.
      channel.postMessage({ type: 'snapshot', ...snapshot });
    },
    close: () => { snapshot = undefined; channel.onmessage = null; channel.close(); },
  };
}
export function isPublishSnapshot(value: unknown, token: string, dungeonId: string): value is PublishSnapshot & { type: 'snapshot' } {
  if (!value || typeof value !== 'object') return false;
  const data = value as PublishSnapshot & { type?: string };
  return data.type === 'snapshot' && data.token === token && data.dungeonId === dungeonId
    && data.document?.id === dungeonId && Array.isArray(data.document.rooms) && Array.isArray(data.document.connections);
}
