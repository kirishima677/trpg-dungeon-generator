import type { Connector, ConnectorDirection, Piece } from '../../model/types';
import { DEFAULT_PIECES } from '../../model/pieceLibrary';

export const MAX_PIECE_SIZE = 16;
export const PIECE_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export const PIECE_KINDS = ['open', 'door', 'secret', 'locked'] as const;
const offsets = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const integerPosition = (p: unknown): p is { x: number; y: number } => {
  if (!p || typeof p !== 'object') return false;
  const v = p as { x: number; y: number };
  return Number.isSafeInteger(v.x) && Number.isSafeInteger(v.y);
};
export const isStandardPiece = (id: string) => DEFAULT_PIECES.some(p => p.id === id);

export function isExteriorConnector(cells: readonly { x: number; y: number }[], position: { x: number; y: number }, direction: ConnectorDirection): boolean {
  const offset = offsets[direction];
  return !!offset && cells.some(c => key(c) === key(position))
    && !cells.some(c => c.x === position.x + offset[0] && c.y === position.y + offset[1]);
}

/** Validate untrusted JSON as well as editor drafts without React or storage. */
export function pieceErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['ピースの定義がありません。'];
  const p = value as Piece;
  const errors: string[] = [];
  if (typeof p.id !== 'string' || !p.id.trim()) errors.push('Piece IDが必要です。');
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('名称が必要です。');
  if (!['rectangle', 'l-shape', 'corridor', 'custom'].includes(p.shape)) errors.push('形状の種類が不正です。');
  if (p.tags !== undefined && (!Array.isArray(p.tags) || p.tags.some(t => typeof t !== 'string'))) errors.push('タグは文字列の配列で指定してください。');
  if (!Array.isArray(p.cells) || p.cells.length === 0) errors.push('床セルが1つ以上必要です。');
  else if (p.cells.length > MAX_PIECE_SIZE ** 2 || p.cells.some(c => !integerPosition(c))) errors.push(`セル座標は整数、セル数は${MAX_PIECE_SIZE ** 2}以内で指定してください。`);
  else {
    const occupied = new Set(p.cells.map(key));
    if (occupied.size !== p.cells.length) errors.push('セルが重複しています。');
    const xs = p.cells.map(c => c.x), ys = p.cells.map(c => c.y);
    if (Math.max(...xs) - Math.min(...xs) >= MAX_PIECE_SIZE || Math.max(...ys) - Math.min(...ys) >= MAX_PIECE_SIZE) errors.push(`ピースの大きさは${MAX_PIECE_SIZE}×${MAX_PIECE_SIZE}以内です。`);
    const visited = new Set<string>(), queue = [p.cells[0]];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i], k = key(cell);
      if (visited.has(k)) continue;
      visited.add(k);
      for (const [dx, dy] of Object.values(offsets)) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (occupied.has(key(next)) && !visited.has(key(next))) queue.push(next);
      }
    }
    if (visited.size !== occupied.size) errors.push('床セルは上下左右で1つにつながる必要があります。');
  }
  if (!Array.isArray(p.connectors) || p.connectors.length > MAX_PIECE_SIZE ** 2 * 4) errors.push('接続口の一覧が不正です。');
  else {
    const ids = new Set<string>(), positions = new Set<string>();
    for (const c of p.connectors) {
      if (!c || typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id)) { errors.push('接続口IDが空、または重複しています。'); continue; }
      ids.add(c.id);
      if (!PIECE_DIRECTIONS.includes(c.direction) || !PIECE_KINDS.includes(c.kind) || c.width !== 1 || !integerPosition(c.position)) {
        errors.push('接続口の方向・種類・座標が不正です。幅は1に固定します。'); continue;
      }
      const edge = `${key(c.position)},${c.direction}`;
      if (positions.has(edge)) errors.push('同じセル・方向に接続口が重複しています。');
      positions.add(edge);
      if (Array.isArray(p.cells) && p.cells.every(integerPosition) && !isExteriorConnector(p.cells, c.position, c.direction)) errors.push(`接続口 ${c.id} は床セルの外周に配置してください。`);
    }
  }
  return [...new Set(errors)];
}

export function normalizePiece(value: unknown): Piece {
  const errors = pieceErrors(value);
  if (errors.length) throw new Error(errors.join('\n'));
  const p = value as Piece;
  const dx = Math.min(...p.cells.map(c => c.x)), dy = Math.min(...p.cells.map(c => c.y));
  return {
    id: p.id, name: p.name.trim(), shape: p.shape,
    cells: p.cells.map(c => ({ x: c.x - dx, y: c.y - dy })).sort((a, b) => a.y - b.y || a.x - b.x),
    connectors: p.connectors.map(c => ({ id: c.id, direction: c.direction, kind: c.kind, width: 1,
      position: { x: c.position.x - dx, y: c.position.y - dy } })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    tags: [...new Set((p.tags ?? []).map(t => t.trim()).filter(Boolean))].sort(),
  };
}

export function pieceStructure(piece: Piece): string {
  const { shape, cells, connectors } = normalizePiece(piece);
  return JSON.stringify({ shape, cells, connectors });
}
export const samePiece = (a: Piece, b: Piece) => JSON.stringify(normalizePiece(a)) === JSON.stringify(normalizePiece(b));

export function duplicatePiece(piece: Piece, id = crypto.randomUUID()): Piece {
  return normalizePiece({ ...structuredClone(piece), id, name: `${piece.name} のコピー`, shape: 'custom' });
}

export function changePieceCell(piece: Piece, position: { x: number; y: number }, add: boolean): { piece: Piece; removed: Connector[] } {
  const cells = add ? (piece.cells.some(c => key(c) === key(position)) ? piece.cells : [...piece.cells, position])
    : piece.cells.filter(c => key(c) !== key(position));
  const connectors = piece.connectors.filter(c => isExteriorConnector(cells, c.position, c.direction));
  return { piece: { ...piece, cells, connectors }, removed: piece.connectors.filter(c => !connectors.includes(c)) };
}
