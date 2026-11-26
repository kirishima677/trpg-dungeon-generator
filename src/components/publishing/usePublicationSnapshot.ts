import { useEffect, useRef, useState } from 'react';
import type { DungeonDocument } from '../../model/types';
import { isPublishSnapshot, snapshotChannelName } from '../../publishing/snapshotChannel';

/** This hook owns only the launch channel and its lifetime, never rendering or saving. */
export function usePublicationSnapshot(onRefresh: () => void) {
  const [snapshot, setSnapshot] = useState<DungeonDocument | null>(null), [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), token = params.get('source') ?? '', dungeonId = params.get('dungeonId') ?? '';
    const channel = new BroadcastChannel(snapshotChannelName(token));
    const timeout = setTimeout(() => setError('編集画面からデータを取得できません。元の編集画面で「出版」を押して開き直してください。'), 5000);
    channel.onmessage = event => {
      if (!isPublishSnapshot(event.data, token, dungeonId)) return;
      revision.current++; clearTimeout(timeout); setSnapshot(event.data.document); setError(''); onRefresh();
    };
    channel.postMessage({ type: 'request', token, dungeonId });
    return () => { clearTimeout(timeout); channel.onmessage = null; channel.close(); };
  }, [onRefresh]);
  return { snapshot, error, revision };
}
