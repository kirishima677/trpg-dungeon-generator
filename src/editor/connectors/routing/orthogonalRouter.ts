import type { ConnectorDirection } from '../../../model/types';
import type { ConnectionGeometry } from '../connectionGeometry';
import type { ConnectionRoute, RoutePoint } from './connectionRouter';

/** Exit/detour clearance in grid cells, independent of SVG pixels and zoom. */
export const CONNECTOR_EXIT_GRID_CELLS = 1;

const DIRECTION_VECTORS: Record<ConnectorDirection, RoutePoint> = {
  north: { x: 0, y: -1 }, south: { x: 0, y: 1 },
  east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
};

function outerRail(a: number, b: number, sign: number): number {
  return sign > 0 ? Math.max(a, b) + CONNECTOR_EXIT_GRID_CELLS
    : Math.min(a, b) - CONNECTOR_EXIT_GRID_CELLS;
}

/** Drop zero-length legs and merge collinear legs only when they continue forward. */
function simplify(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last && last.x === point.x && last.y === point.y) continue;
    const previous = result.at(-2);
    if (last && previous) {
      const dx1 = last.x - previous.x, dy1 = last.y - previous.y;
      const dx2 = point.x - last.x, dy2 = point.y - last.y;
      if ((dx1 === 0 && dx2 === 0 && dy1 * dy2 > 0)
        || (dy1 === 0 && dy2 === 0 && dx1 * dx2 > 0)) result.pop();
    }
    result.push({ ...point });
  }
  return result;
}

function parallelRoute(geometry: ConnectionGeometry, horizontal: boolean): RoutePoint[] {
  const { from, to } = geometry;
  const axis = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const a = from.position[axis], b = to.position[axis];
  const u = from.position[cross], v = to.position[cross];
  const fromSign = DIRECTION_VECTORS[from.direction][axis];
  const toSign = DIRECTION_VECTORS[to.direction][axis];
  const point = (main: number, side: number): RoutePoint => horizontal
    ? { x: main, y: side } : { x: side, y: main };

  if (fromSign === toSign) {
    if (u !== v) {
      const rail = outerRail(a, b, fromSign);
      return [from.position, point(rail, u), point(rail, v), to.position];
    }
    // Collinear same-facing connectors need a perpendicular detour. Cap the
    // exits for close endpoints so the first and last legs don't overlap.
    const clearance = Math.min(CONNECTOR_EXIT_GRID_CELLS, Math.abs(b - a) / 2)
      || CONNECTOR_EXIT_GRID_CELLS;
    const aExit = a + fromSign * clearance;
    const bExit = b + toSign * clearance;
    const lane = u - CONNECTOR_EXIT_GRID_CELLS;
    if (a === b) {
      // Coincident same-facing points: loop instead of immediately reversing.
      const rail = aExit + fromSign * CONNECTOR_EXIT_GRID_CELLS;
      return [from.position, point(aExit, u), point(aExit, lane), point(rail, lane), point(rail, v), to.position];
    }
    return [from.position, point(aExit, u), point(aExit, lane), point(bExit, lane), point(bExit, v), to.position];
  }

  if ((b - a) * fromSign > 0) {
    // Opposite connectors facing one another: straight when aligned, Z otherwise.
    if (u === v) return [from.position, to.position];
    const rail = (a + b) / 2;
    return [from.position, point(rail, u), point(rail, v), to.position];
  }

  // Facing away, or sharing a primary coordinate: leave both connectors
  // outward first, then bridge the exits along a perpendicular lane.
  const aExit = a + fromSign * CONNECTOR_EXIT_GRID_CELLS;
  const bExit = b + toSign * CONNECTOR_EXIT_GRID_CELLS;
  const lane = u === v ? u - CONNECTOR_EXIT_GRID_CELLS : (u + v) / 2;
  return [from.position, point(aExit, u), point(aExit, lane), point(bExit, lane), point(bExit, v), to.position];
}

/** Direction-aware L/Z/detour routing, without obstacles or path search. */
export function orthogonalRouter(geometry: ConnectionGeometry): ConnectionRoute {
  const { from, to } = geometry;
  const fromVector = DIRECTION_VECTORS[from.direction];
  const toVector = DIRECTION_VECTORS[to.direction];
  const horizontal = fromVector.x !== 0;
  if (horizontal === (toVector.x !== 0)) {
    return { points: simplify(parallelRoute(geometry, horizontal)) };
  }

  const elbow = horizontal
    ? { x: to.position.x, y: from.position.y }
    : { x: from.position.x, y: to.position.y };
  const fromLeg = (elbow.x - from.position.x) * fromVector.x + (elbow.y - from.position.y) * fromVector.y;
  const toLeg = (elbow.x - to.position.x) * toVector.x + (elbow.y - to.position.y) * toVector.y;
  if (fromLeg > 0 && toLeg > 0) {
    return { points: simplify([from.position, elbow, to.position]) };
  }

  // The single elbow would enter a connector from the wrong side. Route on
  // outer rails so the first leg is outward and the last leg arrives inward.
  const x = outerRail(from.position.x, to.position.x, horizontal ? fromVector.x : toVector.x);
  const y = outerRail(from.position.y, to.position.y, horizontal ? toVector.y : fromVector.y);
  const bends = horizontal
    ? [{ x, y: from.position.y }, { x, y }, { x: to.position.x, y }]
    : [{ x: from.position.x, y }, { x, y }, { x, y: to.position.y }];
  return { points: simplify([from.position, ...bends, to.position]) };
}
