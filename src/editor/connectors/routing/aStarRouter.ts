import type { OccupancyGrid } from './occupancyGrid';
import type { GridBounds, GridPosition } from './types';

export const SEARCH_MARGIN_CELLS = 8;
export const MAX_SEARCH_SPAN_CELLS = 512;
export const MAX_EXPLORED_NODES = 10_000;

export type GridSearchResult =
  | { status: 'success'; cells: GridPosition[]; exploredNodes: number }
  | { status: 'unreachable' | 'limit-exceeded'; exploredNodes: number };

export interface SearchOptions {
  bounds?: GridBounds;
  maxExploredNodes?: number;
}

interface SearchNode {
  position: GridPosition;
  key: string;
  g: number;
  h: number;
  order: number;
  parent: SearchNode | null;
}

/** Deterministic binary min-heap: f, then h, then insertion order. */
class OpenNodes {
  private nodes: SearchNode[] = [];
  get size() { return this.nodes.length; }
  private before(a: SearchNode, b: SearchNode) {
    return a.g + a.h < b.g + b.h || (a.g + a.h === b.g + b.h
      && (a.h < b.h || (a.h === b.h && a.order < b.order)));
  }
  push(node: SearchNode) {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(this.nodes[index], this.nodes[parent])) break;
      [this.nodes[index], this.nodes[parent]] = [this.nodes[parent], this.nodes[index]];
      index = parent;
    }
  }
  pop(): SearchNode {
    const first = this.nodes[0], last = this.nodes.pop()!;
    if (this.nodes.length === 0) return first;
    this.nodes[0] = last;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.nodes.length && this.before(this.nodes[child + 1], this.nodes[child])) child++;
      if (!this.before(this.nodes[child], this.nodes[index])) break;
      [this.nodes[index], this.nodes[child]] = [this.nodes[child], this.nodes[index]];
      index = child;
    }
    return first;
  }
}

const NEIGHBORS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const keyOf = (cell: GridPosition) => `${cell.x},${cell.y}`;
const distance = (a: GridPosition, b: GridPosition) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const within = (cell: GridPosition, bounds: GridBounds) => cell.x >= bounds.minX && cell.x <= bounds.maxX
  && cell.y >= bounds.minY && cell.y <= bounds.maxY;

/** Include all obstacles + margin, capped to a window containing both endpoints. */
export function searchBounds(start: GridPosition, goal: GridPosition, grid: OccupancyGrid): GridBounds | null {
  const range = (a: number, b: number, low: number, high: number) => {
    const min = Math.min(a, b), max = Math.max(a, b);
    const spare = MAX_SEARCH_SPAN_CELLS - (max - min + 1);
    if (spare < 0) return null;
    return {
      min: Math.max(Math.min(low, min) - SEARCH_MARGIN_CELLS, min - Math.floor(spare / 2)),
      max: Math.min(Math.max(high, max) + SEARCH_MARGIN_CELLS, max + Math.ceil(spare / 2)),
    };
  };
  const x = range(start.x, goal.x, grid.bounds?.minX ?? start.x, grid.bounds?.maxX ?? goal.x);
  const y = range(start.y, goal.y, grid.bounds?.minY ?? start.y, grid.bounds?.maxY ?? goal.y);
  return x && y ? { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max } : null;
}

export function aStarRoute(
  start: GridPosition, goal: GridPosition, grid: OccupancyGrid, options: SearchOptions = {},
): GridSearchResult {
  if (![start.x, start.y, goal.x, goal.y].every(Number.isSafeInteger)
    || grid.isOccupied(start) || grid.isOccupied(goal)) return { status: 'unreachable', exploredNodes: 0 };
  const bounds = options.bounds ?? searchBounds(start, goal, grid);
  if (!bounds || !within(start, bounds) || !within(goal, bounds)
    || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isSafeInteger)
    || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY
    || bounds.maxX - bounds.minX + 1 > MAX_SEARCH_SPAN_CELLS
    || bounds.maxY - bounds.minY + 1 > MAX_SEARCH_SPAN_CELLS) return { status: 'limit-exceeded', exploredNodes: 0 };
  const requested = options.maxExploredNodes ?? MAX_EXPLORED_NODES;
  const maxNodes = Number.isFinite(requested) ? Math.min(Math.max(0, requested), MAX_EXPLORED_NODES) : MAX_EXPLORED_NODES;
  const open = new OpenNodes();
  const best = new Map<string, number>([[keyOf(start), 0]]);
  const closed = new Set<string>();
  let order = 0, exploredNodes = 0, reachedBoundary = false;
  open.push({ position: { ...start }, key: keyOf(start), g: 0, h: distance(start, goal), order: order++, parent: null });
  while (open.size > 0) {
    const current = open.pop();
    if (closed.has(current.key) || current.g !== best.get(current.key)) continue;
    if (exploredNodes >= maxNodes) return { status: 'limit-exceeded', exploredNodes };
    exploredNodes++;
    if (current.position.x === goal.x && current.position.y === goal.y) {
      const cells: GridPosition[] = [];
      for (let node: SearchNode | null = current; node; node = node.parent) cells.push(node.position);
      return { status: 'success', cells: cells.reverse(), exploredNodes };
    }
    closed.add(current.key);
    for (const delta of NEIGHBORS) {
      const position = { x: current.position.x + delta.x, y: current.position.y + delta.y };
      if (grid.isOccupied(position)) continue;
      if (!within(position, bounds)) { reachedBoundary = true; continue; }
      const key = keyOf(position), g = current.g + 1;
      if (closed.has(key) || g >= (best.get(key) ?? Infinity)) continue;
      best.set(key, g);
      open.push({ position, key, g, h: distance(position, goal), order: order++, parent: current });
    }
  }
  // With a margin around ALL obstacles, leaving the window can't open a new
  // passage. A clipped/custom window cannot make that same guarantee.
  const complete = !options.bounds && (!grid.bounds || (bounds.minX < grid.bounds.minX
    && bounds.minY < grid.bounds.minY && bounds.maxX > grid.bounds.maxX && bounds.maxY > grid.bounds.maxY));
  return { status: reachedBoundary && !complete ? 'limit-exceeded' : 'unreachable', exploredNodes };
}
