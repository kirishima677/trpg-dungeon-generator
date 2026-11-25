import { useCallback, useEffect, useState } from 'react';
import type { Piece } from '../../model/types';
import { pieceRepository } from '../../repository/pieceRepository';
import { PIECE_CHANNEL, PIECE_LIBRARY_UPDATED } from '../../editor/pieces/pieceEvents';

export function usePieceLibrary() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { setPieces(await pieceRepository.list()); setError(''); }
    catch { setError('ユーザー定義ピースを読み込めませんでした。'); }
  }, []);
  useEffect(() => {
    void reload();
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PIECE_CHANNEL) : null;
    if (channel) channel.onmessage = event => { if (event.data?.type === PIECE_LIBRARY_UPDATED) void reload(); };
    window.addEventListener('focus', reload);
    return () => { channel?.close(); window.removeEventListener('focus', reload); };
  }, [reload]);
  return { pieces, error, reload };
}
