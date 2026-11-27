export const THEME_CHANNEL = 'trpg-dungeon-generator-themes';
export const THEME_LIBRARY_UPDATED = 'DUNGEON_THEME_LIBRARY_UPDATED';
export function publishThemeLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(THEME_CHANNEL);
    try { channel.postMessage({ type: THEME_LIBRARY_UPDATED }); } finally { channel.close(); }
  } catch { /* Focus refresh recovers missed notifications after successful persistence. */ }
}
