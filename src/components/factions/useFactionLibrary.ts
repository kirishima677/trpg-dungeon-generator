import { useCallback, useEffect, useRef, useState } from 'react';
import type { FactionDefinition } from '../../model/faction';
import { factionRepository } from '../../repository/factionRepository';
import type { FactionRepository } from '../../repository/factionRepository';
import { FACTION_CHANNEL, FACTION_LIBRARY_UPDATED } from '../../factions/factionEvents';
export function useFactionLibrary(repository: FactionRepository = factionRepository) {
  const [themes, setThemes] = useState<FactionDefinition[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    try { const values = await repository.list(); if (generation.current === version) { setThemes(values); setError(''); setReady(true); } }
    catch (e) { if (generation.current === version) setError(e instanceof Error ? e.message : 'テーマ一覧を取得できませんでした。'); }
  }, [repository]);
  useEffect(() => {
    void reload(); let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(FACTION_CHANNEL); channel.onmessage = e => { if (e.data?.type === FACTION_LIBRARY_UPDATED) void reload(); }; } catch { /* Focus refresh remains available. */ }
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { generation.current++; channel?.close(); window.removeEventListener('focus', focus); };
  }, [reload]);
  return { themes, error, ready, reload };
}
