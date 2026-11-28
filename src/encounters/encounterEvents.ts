export const ENCOUNTER_CHANNEL = 'trpg-dungeon-generator-encounters';
export const ENCOUNTER_LIBRARY_UPDATED = 'ENCOUNTER_LIBRARY_UPDATED';
export function publishEncounterLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(ENCOUNTER_CHANNEL);
    try { channel.postMessage({ type: ENCOUNTER_LIBRARY_UPDATED }); } finally { channel.close(); }
  } catch { /* Focus refresh recovers missed notifications after successful persistence. */ }
}
