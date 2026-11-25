export const PIECE_CHANNEL = 'trpg-dungeon-generator-pieces';
export const PIECE_LIBRARY_UPDATED = 'PIECE_LIBRARY_UPDATED';
export function publishPieceLibraryUpdate() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(PIECE_CHANNEL);
    try { channel.postMessage({ type: PIECE_LIBRARY_UPDATED }); }
    finally { channel.close(); }
  } catch { /* Persistence succeeded; focus refresh can recover missed updates. */ }
}
