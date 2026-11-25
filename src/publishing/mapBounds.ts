import type { PublishMapGeometry } from './publishMapGeometry';
import type { PublishProfile } from './publishProfile';
import { validatePublishProfile } from './publishProfile';

export interface MapBounds { minX: number; minY: number; maxX: number; maxY: number }
// Covers wall strokes, labels' white halos and direct-connection markers even with zero padding.
export const DRAWING_MARGIN_CELLS = 0.2;
export function mapBounds(geometry: PublishMapGeometry, paddingCells: number): MapBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const cell of [...geometry.rooms.flatMap(r => r.cells), ...geometry.scene.network.cells]) {
    include(cell.x, cell.y); include(cell.x + 1, cell.y + 1);
  }
  for (const overlay of geometry.overlays) for (const p of overlay.points) include(p.x, p.y);
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  const margin = paddingCells + DRAWING_MARGIN_CELLS;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}
export function outputDimensions(bounds: MapBounds, profile: PublishProfile) {
  validatePublishProfile(profile);
  const width = Math.ceil((bounds.maxX - bounds.minX) * profile.pixelsPerCell);
  const height = Math.ceil((bounds.maxY - bounds.minY) * profile.pixelsPerCell);
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error('描画範囲が不正です。');
  return { width, height };
}
