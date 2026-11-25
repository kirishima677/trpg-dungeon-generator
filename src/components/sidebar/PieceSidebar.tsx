import { DEFAULT_PIECES } from '../../model';
import type { Piece } from '../../model/types';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { usePieceLibrary } from '../pieces/usePieceLibrary';
import { pieceRepository } from '../../repository/pieceRepository';
import { withPieceLibraryRead } from '../../editor/pieces/pieceReferences';
import { useState } from 'react';
import { RoomList } from './RoomList';

const THUMB_SIZE = 80;
const CELL = 12; // px per cell in thumbnail

function PieceThumbnail({ piece }: { piece: Piece }) {
  const cells = piece.cells;
  if (cells.length === 0) return null;

  const minX = Math.min(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y));
  const maxX = Math.max(...cells.map(c => c.x));
  const maxY = Math.max(...cells.map(c => c.y));

  const w = (maxX - minX + 1) * CELL;
  const h = (maxY - minY + 1) * CELL;
  const padded = THUMB_SIZE;

  const fillColor =
    piece.shape === 'corridor' ? '#e0e7ff' :
    piece.shape === 'l-shape'  ? '#d1fae5' :
    '#dbeafe';

  return (
    <svg
      width={padded}
      height={padded}
      style={{ display: 'block' }}
      viewBox={`${minX * CELL - 4} ${minY * CELL - 4} ${w + 8} ${h + 8}`}
    >
      {cells.map(c => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x * CELL}
          y={c.y * CELL}
          width={CELL}
          height={CELL}
          fill={fillColor}
          stroke="#475569"
          strokeWidth={0.8}
        />
      ))}
    </svg>
  );
}

export function PieceSidebar() {
  const { setPendingPiece, pendingPiece } = useDungeonStore(useShallow(s => ({
    setPendingPiece: s.setPendingPiece,
    pendingPiece: s.pendingPiece,
  })));

  const library = usePieceLibrary();
  const [tab, setTab] = useState<'pieces' | 'rooms'>('pieces');
  const pieces = [...DEFAULT_PIECES, ...library.pieces];

  return (
    <div
      style={{
        width: 200, flexShrink: 0,
        overflowY: 'auto',
        borderRight: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: '#475569', marginBottom: 4 }}>
        {tab === 'pieces' ? 'ピースライブラリ' : '部屋一覧'}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button aria-pressed={tab === 'pieces'} onClick={() => setTab('pieces')}>ピース</button>
        <button aria-pressed={tab === 'rooms'} onClick={() => setTab('rooms')}>部屋一覧</button>
      </div>

      {tab === 'rooms' && <RoomList />}
      {tab === 'pieces' && library.error && <p role="alert">{library.error}</p>}

      {tab === 'pieces' && pieces.map(piece => {
        const isSelected = pendingPiece?.id === piece.id;
        return (
          <button
            key={piece.id}
            onClick={() => {
              if (isSelected) setPendingPiece(null);
              else if (DEFAULT_PIECES.some(p => p.id === piece.id)) setPendingPiece(piece);
              else void withPieceLibraryRead(async () => {
                const latest = await pieceRepository.get(piece.id);
                if (latest) setPendingPiece(latest);
                else await library.reload();
              }).catch(() => { void library.reload(); });
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: 8,
              borderRadius: 8,
              border: isSelected ? '2px solid #2563eb' : '2px solid #e2e8f0',
              background: isSelected ? '#dbeafe' : 'white',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <PieceThumbnail piece={piece} />
            <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>
              {piece.name}
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{DEFAULT_PIECES.some(p => p.id === piece.id) ? '標準' : 'ユーザー定義'}</span>
          </button>
        );
      })}
    </div>
  );
}
