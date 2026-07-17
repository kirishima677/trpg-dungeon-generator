import type {
  ConnectorDirection,
  Connector,
  PlacedRoom,
  Rotation,
  Piece,
} from '../model/types';

// ─── Rotation helpers ─────────────────────────────────────────────────────────

/** Rotate a grid cell by `rotation` degrees around (0,0) */
export function rotateCell(
  x: number,
  y: number,
  rotation: Rotation
): { x: number; y: number } {
  switch (rotation) {
    case 0:   return { x, y };
    case 90:  return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
  }
}

/** Rotate a connector direction by `rotation` degrees */
export function rotateDirection(
  dir: ConnectorDirection,
  rotation: Rotation
): ConnectorDirection {
  const order: ConnectorDirection[] = ['north', 'east', 'south', 'west'];
  const steps = rotation / 90;
  const idx = order.indexOf(dir);
  return order[(idx + steps) % 4];
}

/**
 * Opposite direction used when checking compatibility.
 */
export function oppositeDirection(dir: ConnectorDirection): ConnectorDirection {
  const map: Record<ConnectorDirection, ConnectorDirection> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
  };
  return map[dir];
}

// ─── Bounding-box helpers ────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Return the world-space bounding box of a PlacedRoom (in grid cells).
 */
export function roomBounds(room: PlacedRoom): Rect {
  const cells = getWorldCells(room);
  if (cells.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Get world-space cells occupied by a placed room.
 * 1. Rotate the piece's local cells.
 * 2. Translate by room.position.
 */
export function getWorldCells(
  room: PlacedRoom
): { x: number; y: number }[] {
  const { piece, position, rotation } = room;

  // Find the bounding-box centre offset after rotation so we can keep the
  // visual top-left of the rotated piece at `position`.
  const rotated = piece.cells.map(c => rotateCell(c.x, c.y, rotation));

  const minX = Math.min(...rotated.map(c => c.x));
  const minY = Math.min(...rotated.map(c => c.y));

  return rotated.map(c => ({
    x: c.x - minX + position.x,
    y: c.y - minY + position.y,
  }));
}

/**
 * Get world-space connectors of a placed room.
 */
export function getWorldConnectors(
  room: PlacedRoom
): (Connector & { worldPosition: { x: number; y: number }; worldDirection: ConnectorDirection })[] {
  const { piece, position, rotation } = room;

  const rotatedCells = piece.cells.map(c => rotateCell(c.x, c.y, rotation));
  const minX = Math.min(...rotatedCells.map(c => c.x));
  const minY = Math.min(...rotatedCells.map(c => c.y));

  return piece.connectors.map(con => {
    const rotPos = rotateCell(con.position.x, con.position.y, rotation);
    return {
      ...con,
      worldDirection: rotateDirection(con.direction, rotation),
      worldPosition: {
        x: rotPos.x - minX + position.x,
        y: rotPos.y - minY + position.y,
      },
    };
  });
}

// ─── Piece bounding box (local, accounting for rotation) ────────────────────

export function pieceBounds(piece: Piece, rotation: Rotation): { w: number; h: number } {
  const rotated = piece.cells.map(c => rotateCell(c.x, c.y, rotation));
  const minX = Math.min(...rotated.map(c => c.x));
  const minY = Math.min(...rotated.map(c => c.y));
  const maxX = Math.max(...rotated.map(c => c.x));
  const maxY = Math.max(...rotated.map(c => c.y));
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}
