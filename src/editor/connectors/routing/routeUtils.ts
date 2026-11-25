import type { ConnectionGeometry } from '../connectionGeometry';
import { directionVector, oppositeDirection } from '../../../utils/geometry';
import type { RoutePoint, ConnectionRoute } from './types';

/** Drop repeated points and merge collinear legs that continue forward. */
export function simplifyRoutePoints(points: RoutePoint[]): RoutePoint[] {
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

export function followsConnectorDirections(route: ConnectionRoute, geometry: ConnectionGeometry): boolean {
  const first = route.points[0], next = route.points[1];
  const last = route.points.at(-1), previous = route.points.at(-2);
  if (!first || !next || !last || !previous) return false;
  const from = directionVector(geometry.from.direction), to = directionVector(geometry.to.direction);
  return first.x === geometry.from.position.x && first.y === geometry.from.position.y
    && last.x === geometry.to.position.x && last.y === geometry.to.position.y
    && (next.x - first.x) * from.x + (next.y - first.y) * from.y > 0
    && (previous.x - last.x) * to.x + (previous.y - last.y) * to.y > 0;
}

/** Opposed connectors meeting on one shared cell edge need no exterior cell. */
export function isDirectConnection(geometry: ConnectionGeometry): boolean {
  const { from, to } = geometry;
  const vector = directionVector(from.direction);
  return from.position.x === to.position.x && from.position.y === to.position.y
    && to.direction === oppositeDirection(from.direction)
    && Number.isInteger(from.position.x - (vector.x === 0 ? 0.5 : 0))
    && Number.isInteger(from.position.y - (vector.y === 0 ? 0.5 : 0));
}

/** Cell-centred bends and exact edge anchors; never round a path in a renderer. */
export function isCellCenteredRoute(route: ConnectionRoute, geometry: ConnectionGeometry): boolean {
  const points = simplifyRoutePoints(route.points);
  if (!followsConnectorDirections({ points }, geometry)) return false;
  for (const endpoint of [geometry.from, geometry.to]) {
    const vector = directionVector(endpoint.direction);
    if (!Number.isSafeInteger(endpoint.position.x - (vector.x === 0 ? 0.5 : 0))
      || !Number.isSafeInteger(endpoint.position.y - (vector.y === 0 ? 0.5 : 0))) return false;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.y === b.y) {
      if (a.x === b.x || !Number.isSafeInteger(a.y - 0.5)) return false;
    } else if (a.x !== b.x || !Number.isSafeInteger(a.x - 0.5)) return false;
  }
  return points.slice(1, -1).every(p => Number.isSafeInteger(p.x - 0.5) && Number.isSafeInteger(p.y - 0.5));
}
