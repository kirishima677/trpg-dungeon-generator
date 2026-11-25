import type { ConnectionGeometry } from '../connectionGeometry';
import { directionVector } from '../../../utils/geometry';
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
