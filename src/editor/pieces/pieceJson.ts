import type { Piece } from '../../model/types';
import { normalizePiece } from './pieceDefinition';

export const PIECE_FORMAT_ID = 'trpg-dungeon-piece';
export const PIECE_SCHEMA_VERSION = '1.0.0';
export function buildPieceExport(piece: Piece) {
  return { formatId: PIECE_FORMAT_ID, schemaVersion: PIECE_SCHEMA_VERSION, piece: normalizePiece(piece) };
}
export function parsePieceImport(value: unknown): Piece {
  if (!value || typeof value !== 'object') throw new Error('ピースJSONが不正です。');
  const raw = value as Record<string, unknown>;
  if (raw.formatId !== PIECE_FORMAT_ID || raw.schemaVersion !== PIECE_SCHEMA_VERSION) throw new Error('ピースJSONの形式・バージョンが不正です。');
  return normalizePiece(raw.piece);
}
