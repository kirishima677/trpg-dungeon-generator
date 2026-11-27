export const CONTENT_CHANNEL = 'trpg-dungeon-generator-contents';
export const CONTENT_LIBRARY_UPDATED = 'CONTENT_LIBRARY_UPDATED';
export function publishContentLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(CONTENT_CHANNEL);
    try { channel.postMessage({ type: CONTENT_LIBRARY_UPDATED }); }
    finally { channel.close(); }
  } catch { /* A focus refresh can recover missed notifications after successful persistence. */ }
}
