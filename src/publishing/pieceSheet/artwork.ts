import type { PieceInventoryItem, PieceSheetOptions } from './inventory';
import { getWorldCells, getWorldConnectors } from '../../utils/geometry';
import { cellShapes } from '../../editor/connectors/corridor/cellShapes';
import { corridorWalls } from '../../editor/connectors/corridor/corridorShape';
import { DIRECTION_BITS } from '../../editor/connectors/corridor/directions';
import { GRID_SIZE, GRID_LINE_COLOR, GRID_LINE_WIDTH } from '../../editor/grid';

export function buildPrintablePiece(item: PieceInventoryItem, rotation: 0 | 90, options: PieceSheetOptions) {
  const room = { id: '', pieceId: item.piece.id, piece: item.piece, position: { x: 0, y: 0 }, rotation };
  const cells = getWorldCells(room), connectors = getWorldConnectors(room);
  const occupied = new Set(cells.map(c => `${c.x},${c.y}`));
  const physical = cells.map(c => ({ ...c, connections: [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]
    .reduce((mask, [dx, dy, bit]) => occupied.has(`${c.x + dx},${c.y + dy}`) ? mask | bit : mask, 0) }));
  const cuts = physical.flatMap(corridorWalls);
  const geometry = physical.map(c => ({ ...c, connections: connectors.reduce((mask, port) =>
    port.worldPosition.x === c.x && port.worldPosition.y === c.y ? mask | DIRECTION_BITS[port.worldDirection] : mask, c.connections) }));
  const shapes = cellShapes(geometry);
  const path = (e: { x1: number; y1: number; x2: number; y2: number }) => `M ${e.x1 * GRID_SIZE} ${e.y1 * GRID_SIZE} L ${e.x2 * GRID_SIZE} ${e.y2 * GRID_SIZE}`;
  const boundary = new Set(cuts.map(path));
  // Grid is decorative and strictly internal; an opening never becomes a wall.
  const grid = (shapes.grid.match(/M [^M]+/g) ?? []).map(s => s.trim()).filter(s => !boundary.has(s)).join(' ');
  const marks = options.showConnectorMarks ? connectors.map(c => {
    const x = (c.worldPosition.x + 0.5) * GRID_SIZE, y = (c.worldPosition.y + 0.5) * GRID_SIZE;
    const [dx, dy] = c.worldDirection === 'north' ? [0, -1] : c.worldDirection === 'south' ? [0, 1] : c.worldDirection === 'east' ? [1, 0] : [-1, 0];
    return `<path d="M ${x + dx * 12} ${y + dy * 12} L ${x + dx * 18} ${y + dy * 18}" stroke="${c.kind === 'secret' ? '#7c3aed' : '#475569'}" stroke-width="2"/>`;
  }).join('') : '';
  const svg = `<g fill="#f1f5f9">${shapes.floors.map(f => `<path d="${f.d}"/>`).join('')}</g>`
    + (options.showGrid ? `<path data-layer="grid" d="${grid}" fill="none" stroke="${GRID_LINE_COLOR}" stroke-width="${GRID_LINE_WIDTH}"/>` : '')
    + `<path data-layer="walls" d="${shapes.walls.map(w => w.d).join(' ')}" fill="none" stroke="#334155" stroke-width="2"/>`
    + (options.showCutLines ? `<path data-layer="cuts" d="${cuts.map(path).join(' ')}" fill="none" stroke="#64748b" stroke-width="0.6" stroke-dasharray="2 2"/>` : '') + marks;
  return { id: `${item.code}-${rotation}`, inventoryItemId: item.id, cells, rotation, connectors,
    widthCells: Math.max(...cells.map(c => c.x)) + 1, heightCells: Math.max(...cells.map(c => c.y)) + 1, svg, cuts };
}
