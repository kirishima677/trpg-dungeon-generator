import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomTheme } from '../../model/roomTheme';
import { roomThemeRepository } from '../../repository/roomThemeRepository';
import type { RoomThemeRepository } from '../../repository/roomThemeRepository';
import { ROOM_THEME_CHANNEL, ROOM_THEME_LIBRARY_UPDATED } from '../../themes/roomThemeEvents';
export function useRoomThemeLibrary(repository: RoomThemeRepository = roomThemeRepository) {
  const [themes, setThemes] = useState<RoomTheme[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    try { const values = await repository.list(); if (generation.current === version) { setThemes(values); setError(''); setReady(true); } }
    catch (e) { if (generation.current === version) setError(e instanceof Error ? e.message : 'テーマ一覧を取得できませんでした。'); }
  }, [repository]);
  useEffect(() => {
    void reload(); let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(ROOM_THEME_CHANNEL); channel.onmessage = e => { if (e.data?.type === ROOM_THEME_LIBRARY_UPDATED) void reload(); }; } catch { /* Focus refresh remains available. */ }
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { generation.current++; channel?.close(); window.removeEventListener('focus', focus); };
  }, [reload]);
  return { themes, error, ready, reload };
}
