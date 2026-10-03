import type { Piece } from './types';

/**
 * Built-in piece definitions.
 * All measurements are in grid cells.
 *
 * IMPORTANT: Connector IDs must be static strings (not randomly generated) so
 * that Connection references survive save/load round-trips.
 */
export const DEFAULT_PIECES: Piece[] = [
  // ── 4×4 Square Room ────────────────────────────────────────────────────────
  {
    id: 'piece-rect-4x4',
    name: '正方形の部屋 (4×4)',
    shape: 'rectangle',
    cells: Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) => ({ x: col, y: row }))
    ).flat(),
    connectors: [
      { id: 'piece-rect-4x4-north', direction: 'north', width: 1, kind: 'door', position: { x: 1, y: 0 } },
      { id: 'piece-rect-4x4-south', direction: 'south', width: 1, kind: 'door', position: { x: 1, y: 3 } },
      { id: 'piece-rect-4x4-east',  direction: 'east',  width: 1, kind: 'door', position: { x: 3, y: 1 } },
      { id: 'piece-rect-4x4-west',  direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 1 } },
    ],
    tags: ['room', 'square'],
  },

  // ── 3×6 Rectangular Room ──────────────────────────────────────────────────
  {
    id: 'piece-rect-3x6',
    name: '長方形の部屋 (3×6)',
    shape: 'rectangle',
    cells: Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) => ({ x: col, y: row }))
    ).flat(),
    connectors: [
      { id: 'piece-rect-3x6-north', direction: 'north', width: 1, kind: 'door', position: { x: 2, y: 0 } },
      { id: 'piece-rect-3x6-south', direction: 'south', width: 1, kind: 'door', position: { x: 2, y: 2 } },
      { id: 'piece-rect-3x6-east',  direction: 'east',  width: 1, kind: 'door', position: { x: 5, y: 1 } },
      { id: 'piece-rect-3x6-west',  direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 1 } },
    ],
    tags: ['room', 'rectangle'],
  },

  // ── L-shaped Room ──────────────────────────────────────────────────────────
  {
    id: 'piece-l-shape',
    name: 'L字の部屋',
    shape: 'l-shape',
    cells: [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
      { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
    ],
    connectors: [
      { id: 'piece-l-shape-north', direction: 'north', width: 1, kind: 'door', position: { x: 0, y: 0 } },
      { id: 'piece-l-shape-east',  direction: 'east',  width: 1, kind: 'door', position: { x: 1, y: 1 } },
      { id: 'piece-l-shape-south', direction: 'south', width: 1, kind: 'door', position: { x: 2, y: 3 } },
      { id: 'piece-l-shape-west',  direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 2 } },
    ],
    tags: ['room', 'l-shape'],
  },

  // ── 1×4 Corridor (horizontal) ──────────────────────────────────────────────
  {
    id: 'piece-corridor-h4',
    name: '通路 (4マス)',
    shape: 'corridor',
    cells: [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ],
    connectors: [
      { id: 'piece-corridor-h4-west', direction: 'west', width: 1, kind: 'open', position: { x: 0, y: 0 } },
      { id: 'piece-corridor-h4-east', direction: 'east', width: 1, kind: 'open', position: { x: 3, y: 0 } },
    ],
    tags: ['corridor'],
  },

  // ── 1×2 Short Corridor ─────────────────────────────────────────────────────
  {
    id: 'piece-corridor-h2',
    name: '短い通路 (2マス)',
    shape: 'corridor',
    cells: [
      { x: 0, y: 0 }, { x: 1, y: 0 },
    ],
    connectors: [
      { id: 'piece-corridor-h2-west', direction: 'west', width: 1, kind: 'open', position: { x: 0, y: 0 } },
      { id: 'piece-corridor-h2-east', direction: 'east', width: 1, kind: 'open', position: { x: 1, y: 0 } },
    ],
    tags: ['corridor'],
  },
];
