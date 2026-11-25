import type { ConnectionType } from '../../../model/types';
import type { CorridorCell } from './corridorGeometry';

export interface CorridorContribution {
  connectionId: string;
  type: ConnectionType;
  cells: readonly CorridorCell[];
}

export interface CorridorNetworkCell extends CorridorCell {
  type: ConnectionType;
  sourceConnectionIds: string[];
}

export interface CorridorNetwork {
  cells: CorridorNetworkCell[];
  byCoordinate: Map<string, CorridorNetworkCell[]>;
}

/** Only normal corridors share a merge group; special connections stay separate. */
function mergeGroup(source: CorridorContribution): string {
  return source.type === 'corridor' ? 'corridor' : JSON.stringify([source.type, source.connectionId]);
}

/** Sparse aggregation, independent of React, routing, SVG and persisted models. */
export function buildCorridorNetwork(contributions: readonly CorridorContribution[]): CorridorNetwork {
  const groups = new Map<string, { cell: CorridorCell; type: ConnectionType; sources: Set<string> }>();
  for (const source of contributions) {
    const group = mergeGroup(source);
    for (const cell of source.cells) {
      const key = JSON.stringify([group, cell.x, cell.y]);
      let target = groups.get(key);
      if (!target) {
        target = { cell: { ...cell }, type: source.type, sources: new Set() };
        groups.set(key, target);
      } else {
        // Never infer an edge just because another cell is nearby.
        target.cell.connections |= cell.connections;
      }
      target.sources.add(source.connectionId);
    }
  }
  const cells: CorridorNetworkCell[] = [...groups.values()].map(({ cell, type, sources }) => ({
    ...cell, type, sourceConnectionIds: [...sources].sort(),
  })).sort((a, b) => a.y - b.y || a.x - b.x || compare(a.type, b.type)
    || compare(a.sourceConnectionIds[0], b.sourceConnectionIds[0]));
  const byCoordinate = new Map<string, CorridorNetworkCell[]>();
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (!byCoordinate.has(key)) byCoordinate.set(key, []);
    byCoordinate.get(key)!.push(cell);
  }
  return { cells, byCoordinate };
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Sorted source IDs make shared-cell cycling stable across regeneration. */
export function nextConnectionCandidate(ids: readonly string[], selectedId: string | null): string | null {
  if (ids.length === 0) return null;
  const current = selectedId === null ? -1 : ids.indexOf(selectedId);
  return ids[(current + 1) % ids.length];
}

export function connectionActionForCell(cell: CorridorNetworkCell, selectedId: string | null, deleteMode: boolean) {
  const connectionId = nextConnectionCandidate(cell.sourceConnectionIds, selectedId);
  if (!connectionId) return null;
  // A shared-cell click must never guess which connection to destroy.
  return { type: deleteMode && cell.sourceConnectionIds.length === 1 ? 'delete' as const : 'select' as const, connectionId };
}
