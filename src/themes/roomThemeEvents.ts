export const ROOM_THEME_CHANNEL = 'trpg-dungeon-generator-room-themes';
export const ROOM_THEME_LIBRARY_UPDATED = 'ROOM_THEME_LIBRARY_UPDATED';
export function publishRoomThemeLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(ROOM_THEME_CHANNEL);
    try { channel.postMessage({ type: ROOM_THEME_LIBRARY_UPDATED }); } finally { channel.close(); }
  } catch { /* Focus refresh recovers missed notifications after successful persistence. */ }
}
