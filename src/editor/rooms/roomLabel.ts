export interface RoomLabelVisibility { numbers: boolean; names: boolean }

/** Pick an occupied cell near the centre, with a horizontal run for readable text. */
export function roomLabelLayout(cells: readonly { x: number; y: number }[]) {
  if (cells.length === 0) return null;
  const minX = Math.min(...cells.map(c => c.x)), maxX = Math.max(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
  const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
  let anchor = cells[0], distance = Infinity;
  for (const cell of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const d = (cell.x + 0.5 - cx) ** 2 + (cell.y + 0.5 - cy) ** 2;
    if (d < distance) { anchor = cell; distance = d; }
  }
  const occupied = new Set(cells.map(c => `${c.x},${c.y}`));
  let left = anchor.x, right = anchor.x;
  while (occupied.has(`${left - 1},${anchor.y}`)) left--;
  while (occupied.has(`${right + 1},${anchor.y}`)) right++;
  return { x: anchor.x + 0.5, y: anchor.y + 0.5, width: 2 * Math.min(anchor.x - left + 0.5, right - anchor.x + 0.5) };
}
