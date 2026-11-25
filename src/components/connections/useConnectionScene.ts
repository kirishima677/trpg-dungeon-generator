import { useMemo, useState } from 'react';
import type { Connection, PlacedRoom } from '../../model/types';
import { createConnectionSceneResolver } from '../../editor/connectors/corridor/connectionScene';

export function useConnectionScene(rooms: PlacedRoom[], connections: Connection[]) {
  const [resolve] = useState(createConnectionSceneResolver);
  return useMemo(() => resolve(rooms, connections), [resolve, rooms, connections]);
}
