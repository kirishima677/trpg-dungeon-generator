import { useMemo, useRef } from 'react';
import type { Connection, PlacedRoom } from '../../model/types';
import { createOccupancyGrid } from '../../editor/connectors/routing/occupancyGrid';
import { routeConnections } from '../../editor/connectors/routing/connectionRouter';
import { prepareConnectionScene } from '../../editor/connectors/corridor/connectionScene';
import type { CachedCorridor } from '../../editor/connectors/corridor/connectionScene';

export function useConnectionScene(rooms: PlacedRoom[], connections: Connection[]) {
  const grid = useMemo(() => createOccupancyGrid(rooms), [rooms]);
  const results = useMemo(() => routeConnections(connections, rooms, grid), [connections, rooms, grid]);
  const cache = useRef(new Map<string, CachedCorridor>());
  return useMemo(() => {
    const scene = prepareConnectionScene(connections, rooms, results, grid, cache.current);
    cache.current = scene.cache;
    return scene;
  }, [connections, rooms, results, grid]);
}
