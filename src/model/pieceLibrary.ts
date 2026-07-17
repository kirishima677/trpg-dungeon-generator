import { v4 as uuid } from 'uuid';
import type { Piece } from './types';

/**
 * Built-in piece definitions.
 * All measurements are in grid cells.
 */

const mkId = () => uuid();

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
      // North wall centre
      { id: mkId(), direction: 'north', width: 1, kind: 'door', position: { x: 1, y: 0 } },
      // South wall centre
      { id: mkId(), direction: 'south', width: 1, kind: 'door', position: { x: 1, y: 3 } },
      // East wall centre
      { id: mkId(), direction: 'east',  width: 1, kind: 'door', position: { x: 3, y: 1 } },
      // West wall centre
      { id: mkId(), direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 1 } },
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
      { id: mkId(), direction: 'north', width: 1, kind: 'door', position: { x: 2, y: 0 } },
      { id: mkId(), direction: 'south', width: 1, kind: 'door', position: { x: 2, y: 2 } },
      { id: mkId(), direction: 'east',  width: 1, kind: 'door', position: { x: 5, y: 1 } },
      { id: mkId(), direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 1 } },
    ],
    tags: ['room', 'rectangle'],
  },

  // ── L-shaped Room ──────────────────────────────────────────────────────────
  {
    id: 'piece-l-shape',
    name: 'L字の部屋',
    shape: 'l-shape',
    // An L occupying a 4×4 bounding box: left column (4 cells) + bottom row (3 cells, skipping corner)
    cells: [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
      { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
    ],
    connectors: [
      { id: mkId(), direction: 'north', width: 1, kind: 'door', position: { x: 0, y: 0 } },
      { id: mkId(), direction: 'east',  width: 1, kind: 'door', position: { x: 1, y: 1 } },
      { id: mkId(), direction: 'south', width: 1, kind: 'door', position: { x: 2, y: 3 } },
      { id: mkId(), direction: 'west',  width: 1, kind: 'door', position: { x: 0, y: 2 } },
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
      { id: mkId(), direction: 'west', width: 1, kind: 'open', position: { x: 0, y: 0 } },
      { id: mkId(), direction: 'east', width: 1, kind: 'open', position: { x: 3, y: 0 } },
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
      { id: mkId(), direction: 'west', width: 1, kind: 'open', position: { x: 0, y: 0 } },
      { id: mkId(), direction: 'east', width: 1, kind: 'open', position: { x: 1, y: 0 } },
    ],
    tags: ['corridor'],
  },
];
