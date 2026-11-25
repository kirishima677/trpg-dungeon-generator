/** Derived coordinates in grid-cell units, never persisted in DungeonDocument. */
export interface RoutePoint { x: number; y: number }
export interface ConnectionRoute { points: RoutePoint[] }
export interface GridPosition { x: number; y: number }
export interface GridBounds { minX: number; minY: number; maxX: number; maxY: number }

export type RoutingResult =
  | { status: 'success'; route: ConnectionRoute; method: 'orthogonal' | 'a-star' | 'direct' }
  | { status: 'unreachable' | 'limit-exceeded'; fallback: ConnectionRoute }
  | { status: 'invalid'; route: null };
