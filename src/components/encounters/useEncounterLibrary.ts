import { useCallback, useEffect, useRef, useState } from 'react';
import type { EncounterTemplate } from '../../model/encounter/template';
import { encounterRepository } from '../../repository/encounterRepository';
import type { EncounterRepository } from '../../repository/encounterRepository';
import { ENCOUNTER_CHANNEL, ENCOUNTER_LIBRARY_UPDATED } from '../../encounters/encounterEvents';
export function useEncounterLibrary(repository: EncounterRepository = encounterRepository) {
  const [themes, setThemes] = useState<EncounterTemplate[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    try { const values = await repository.list(); if (generation.current === version) { setThemes(values); setError(''); setReady(true); } }
    catch (e) { if (generation.current === version) setError(e instanceof Error ? e.message : 'テーマ一覧を取得できませんでした。'); }
  }, [repository]);
  useEffect(() => {
    void reload(); let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(ENCOUNTER_CHANNEL); channel.onmessage = e => { if (e.data?.type === ENCOUNTER_LIBRARY_UPDATED) void reload(); }; } catch { /* Focus refresh remains available. */ }
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { generation.current++; channel?.close(); window.removeEventListener('focus', focus); };
  }, [reload]);
  return { themes, error, ready, reload };
}
