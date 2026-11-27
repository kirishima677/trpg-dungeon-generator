import { useCallback, useEffect, useRef, useState } from 'react';
import type { Piece } from '../../model/types';
import type { ContentDefinition } from '../../model/content';
import { DEFAULT_PIECES } from '../../model/pieceLibrary';
import { pieceRepository } from '../../repository/pieceRepository';
import { contentRepository } from '../../repository/contentRepository';
import { CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED } from '../../content/contentEvents';
import { PIECE_CHANNEL, PIECE_LIBRARY_UPDATED } from '../../editor/pieces/pieceEvents';

export interface ThemeMaterialRepositories { pieces: Pick<typeof pieceRepository, 'list'>; contents: Pick<typeof contentRepository, 'list'> }
export const themeMaterialRepositories: ThemeMaterialRepositories = { pieces: pieceRepository, contents: contentRepository };
export function useThemeMaterials(repositories: ThemeMaterialRepositories = themeMaterialRepositories) {
  const [pieces, setPieces] = useState<Piece[]>(DEFAULT_PIECES), [contents, setContents] = useState<ContentDefinition[]>([]);
  const [pieceReady, setPieceReady] = useState(false), [contentReady, setContentReady] = useState(false);
  const [pieceError, setPieceError] = useState(''), [contentError, setContentError] = useState('');
  const generations = useRef({ piece: 0, content: 0 });
  const loadPieces = useCallback(async () => {
    const version = ++generations.current.piece;
    try { const values = await repositories.pieces.list(); if (generations.current.piece === version) { setPieces([...DEFAULT_PIECES, ...values]); setPieceReady(true); setPieceError(''); } }
    catch (e) { if (generations.current.piece === version) setPieceError(e instanceof Error ? e.message : 'Piece一覧の取得に失敗しました。'); }
  }, [repositories]);
  const loadContents = useCallback(async () => {
    const version = ++generations.current.content;
    try { const values = await repositories.contents.list(); if (generations.current.content === version) { setContents(values); setContentReady(true); setContentError(''); } }
    catch (e) { if (generations.current.content === version) setContentError(e instanceof Error ? e.message : 'Content一覧の取得に失敗しました。'); }
  }, [repositories]);
  const reload = useCallback(async () => { await Promise.all([loadPieces(), loadContents()]); }, [loadPieces, loadContents]);
  useEffect(() => {
    void reload(); const channels: BroadcastChannel[] = [];
    for (const [name, type, load] of [[PIECE_CHANNEL, PIECE_LIBRARY_UPDATED, loadPieces], [CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED, loadContents]] as const) {
      try { const channel = new BroadcastChannel(name); channel.onmessage = e => { if (e.data?.type === type) void load(); }; channels.push(channel); } catch { /* Focus refresh remains available. */ }
    }
    const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => { generations.current.piece++; generations.current.content++; channels.forEach(c => c.close()); window.removeEventListener('focus', focus); };
  }, [reload, loadPieces, loadContents]);
  return { pieces, contents, ready: pieceReady && contentReady, error: [pieceError, contentError].filter(Boolean).join(' / '), reload };
}
