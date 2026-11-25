import { createConnectionSceneResolver } from '../editor/connectors/corridor/connectionScene';
import { cellShapes } from '../editor/connectors/corridor/cellShapes';
import { getWorldCells, getWorldConnectors } from '../utils/geometry';
import { NORTH, EAST, SOUTH, WEST } from '../editor/connectors/corridor/directions';
import { publishRooms } from './publishDocumentBuilder';
import type { PublishDocument } from './publishDocumentBuilder';

const directions = { north: NORTH, east: EAST, south: SOUTH, west: WEST };
export function buildPublishMapGeometry(document: PublishDocument) {
  const rooms = publishRooms(document);
  const scene = createConnectionSceneResolver()(rooms, document.connections);
  const roomGeometry = rooms.map(room => {
    const cells = getWorldCells(room), occupied = new Set(cells.map(c => `${c.x},${c.y}`));
    const openings = new Map<string, number>();
    for (const c of getWorldConnectors(room)) {
      if (!scene.openConnectorIds.get(room.id)?.has(c.id)) continue;
      const key = `${c.worldPosition.x},${c.worldPosition.y}`;
      openings.set(key, (openings.get(key) ?? 0) | directions[c.worldDirection]);
    }
    const shapes = cellShapes(cells.map(c => {
      let connections = openings.get(`${c.x},${c.y}`) ?? 0;
      for (const [dx, dy, bit] of [[0, -1, NORTH], [1, 0, EAST], [0, 1, SOUTH], [-1, 0, WEST]]) {
        if (occupied.has(`${c.x + dx},${c.y + dy}`)) connections |= bit;
      }
      return { ...c, connections };
    }));
    return { room, cells, shapes };
  });
  const unresolved = scene.drawings.filter(d => d.result.status !== 'success'
    || (d.connection.type === 'corridor' && d.corridor?.status !== 'success'));
  const overlays = scene.drawings.flatMap(d => {
    const failed = unresolved.includes(d);
    if ((failed && document.audience === 'player') || d.result.status === 'invalid') return [];
    if (!failed && d.connection.type === 'corridor') return [];
    const route = d.result.status === 'success' ? d.result.route : d.result.fallback;
    return [{ points: route.points, type: d.connection.type, failed,
      color: failed ? '#dc2626' : d.connection.type === 'secret' ? '#7c3aed' : '#475569' }];
  });
  return { document, rooms: roomGeometry, scene, corridor: cellShapes(scene.network.cells), overlays, unresolvedCount: unresolved.length };
}
export type PublishMapGeometry = ReturnType<typeof buildPublishMapGeometry>;
