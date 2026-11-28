export const FACTION_CHANNEL = 'trpg-dungeon-generator-factions';
export const FACTION_LIBRARY_UPDATED = 'FACTION_LIBRARY_UPDATED';
export function publishFactionLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(FACTION_CHANNEL);
    try { channel.postMessage({ type: FACTION_LIBRARY_UPDATED }); } finally { channel.close(); }
  } catch { /* Focus refresh recovers missed notifications after successful persistence. */ }
}
