import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentDefinition } from '../../model/content';
import { CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED } from '../../content/contentEvents';
import { contentRepository } from '../../repository/contentRepository';
import type { ContentRepository } from '../../repository/contentRepository';

/** Read-only subscription for content pickers. Never touches saved Entity snapshots or editor drafts. */
export function useContentLibrary(repository: ContentRepository = contentRepository) {
  const [contents, setContents] = useState<ContentDefinition[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const values = await repository.list();
      if (generation.current === request) { setContents(values); setError(''); setReady(true); }
    } catch (e) { if (generation.current === request) setError(e instanceof Error ? e.message : 'コンテンツを取得できませんでした。'); }
  }, [repository]);
  useEffect(() => {
    void reload();
    let channel: BroadcastChannel | null = null;
    try { channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CONTENT_CHANNEL); } catch { /* Focus refresh remains available. */ }
    if (channel) channel.onmessage = event => { if (event.data?.type === CONTENT_LIBRARY_UPDATED) void reload(); };
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { generation.current++; channel?.close(); window.removeEventListener('focus', focus); };
  }, [reload]);
  return { contents, error, ready, reload };
}
