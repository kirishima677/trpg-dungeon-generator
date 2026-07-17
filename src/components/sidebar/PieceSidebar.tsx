import { DEFAULT_PIECES } from '../../model';
import type { Piece } from '../../model/types';
import { useDungeonStore } from '../../store';

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
  const { setPendingPiece, pendingPiece } = useDungeonStore(s => ({
    setPendingPiece: s.setPendingPiece,
    pendingPiece: s.pendingPiece,
  }));

  const pieces = DEFAULT_PIECES;

  return (
    <div
      style={{
        width: 200,
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
        ピースライブラリ
      </div>

      {pieces.map(piece => {
        const isSelected = pendingPiece?.id === piece.id;
        return (
          <button
            key={piece.id}
            onClick={() =>
              isSelected ? setPendingPiece(null) : setPendingPiece(piece)
            }
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
          </button>
        );
      })}
    </div>
  );
}
