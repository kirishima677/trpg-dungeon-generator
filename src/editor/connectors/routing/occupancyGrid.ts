import type { PlacedRoom } from '../../../model/types';
import { getWorldCells } from '../../../utils/geometry';
import type { ConnectionRoute, GridBounds, GridPosition, RoutePoint } from './types';

export interface OccupancyGrid {
  readonly bounds: Readonly<GridBounds> | null;
  readonly size: number;
  isOccupied(position: GridPosition): boolean;
  intersectsSegment(from: RoutePoint, to: RoutePoint): boolean;
}

/** Sparse cells plus row/column indexes: segment checks don't walk empty map space. */
export class SparseOccupancyGrid implements OccupancyGrid {
  private readonly occupied = new Set<string>();
  private readonly rows = new Map<number, Set<number>>();
  private readonly columns = new Map<number, Set<number>>();
  readonly bounds: GridBounds | null;

  constructor(cells: Iterable<GridPosition>) {
    let bounds: GridBounds | null = null;
    for (const cell of cells) {
      // The editor uses integer cells. Conservatively cover partial cells in
      // imported fractional placements rather than ignoring an occupied area.
      for (const x of new Set([Math.floor(cell.x), Math.ceil(cell.x)])) {
        for (const y of new Set([Math.floor(cell.y), Math.ceil(cell.y)])) {
          this.occupied.add(`${x},${y}`);
          if (!this.rows.has(y)) this.rows.set(y, new Set());
          if (!this.columns.has(x)) this.columns.set(x, new Set());
          this.rows.get(y)!.add(x);
          this.columns.get(x)!.add(y);
          bounds = bounds ? {
            minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y),
            maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y),
          } : { minX: x, minY: y, maxX: x, maxY: y };
        }
      }
    }
    this.bounds = bounds;
  }

  get size() { return this.occupied.size; }

  isOccupied(position: GridPosition): boolean {
    return this.occupied.has(`${position.x},${position.y}`);
  }

  intersectsSegment(from: RoutePoint, to: RoutePoint): boolean {
    if (from.x === to.x && from.y === to.y) return false;
    const horizontal = from.y === to.y;
    if (!horizontal && from.x !== to.x) return true;
    const fixed = horizontal ? from.y : from.x;
    const min = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const max = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const index = horizontal ? this.rows : this.columns;
    // On a grid edge, check BOTH adjacent rows/columns. A route cannot sneak
    // through a shared wall. Merely touching the end of a segment is allowed.
    const bands = Number.isInteger(fixed) ? [fixed - 1, fixed] : [Math.floor(fixed)];
    for (const band of bands) {
      for (const occupied of index.get(band) ?? []) {
        if (occupied < max && occupied + 1 > min) return true;
      }
    }
    return false;
  }
}

export function createOccupancyGrid(rooms: PlacedRoom[]): OccupancyGrid {
  return new SparseOccupancyGrid(rooms.flatMap(room => getWorldCells(room)));
}

/** Check every entire segment, including intermediate cells and wall boundaries. */
export function isRouteClear(route: ConnectionRoute, grid: OccupancyGrid): boolean {
  if (route.points.length < 2 || route.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  for (let index = 1; index < route.points.length; index++) {
    const from = route.points[index - 1], to = route.points[index];
    if ((from.x === to.x && from.y === to.y) || grid.intersectsSegment(from, to)) return false;
  }
  return true;
}
