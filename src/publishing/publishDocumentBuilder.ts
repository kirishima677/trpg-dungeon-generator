import type { Connection, DungeonDocument, PlacedRoom } from '../model/types';
import { pieceErrors } from '../editor/pieces/pieceDefinition';
import { roomDisplayName } from '../model/roomInformation';
import type { PublishAudience } from './publishProfile';

export type PublishRoom = Omit<PlacedRoom, 'information'> & { label: { number: string; name: string } };
export interface PublishDocument {
  audience: PublishAudience;
  rooms: PublishRoom[];
  connections: Connection[];
}

/** Allowlist only. No project name, Markdown, notes, descriptions, tags or original IDs. */
export function buildPublishDocument(source: DungeonDocument, audience: PublishAudience): PublishDocument {
  if (!['player', 'gm'].includes(audience)) throw new Error('出力対象が不正です。');
  const roomIds = new Map<string, string>(), connectorIds = new Map<string, Map<string, string>>();
  // Keep the editor's deterministic routing-budget priority, without exporting private IDs.
  const included = [...source.connections].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .filter(c => audience === 'gm' || c.type !== 'secret');
  const used = new Map<string, Set<string>>();
  for (const c of included) {
    for (const [roomId, connectorId] of [[c.fromRoomId, c.fromConnectorId], [c.toRoomId, c.toConnectorId]]) {
      if (!used.has(roomId)) used.set(roomId, new Set());
      used.get(roomId)!.add(connectorId);
    }
  }
  const rooms: PublishRoom[] = source.rooms.map((room, index) => {
    if (roomIds.has(room.id) || !room.piece || room.pieceId !== room.piece.id || pieceErrors(room.piece).length
      || ![0, 90, 180, 270].includes(room.rotation)
      || !Number.isSafeInteger(room.position.x) || !Number.isSafeInteger(room.position.y)
      || Math.abs(room.position.x) > 1_000_000 || Math.abs(room.position.y) > 1_000_000) {
      throw new Error('部屋のピース定義・参照または配置が不正です。元のダンジョンを確認してください。');
    }
    const id = `room-${index}`, pieceId = `piece-${index}`;
    roomIds.set(room.id, id);
    const connectors = new Map<string, string>(); connectorIds.set(room.id, connectors);
    return { id, pieceId, position: { x: room.position.x, y: room.position.y }, rotation: room.rotation,
      label: { number: room.information?.number ?? '', name: roomDisplayName(room) },
      piece: { id: pieceId, name: '', shape: room.piece.shape,
        cells: room.piece.cells.map(c => ({ x: c.x, y: c.y })),
        connectors: room.piece.connectors.filter(c => used.get(room.id)?.has(c.id)).map((c, i) => {
          const connectorId = `connector-${i}`; connectors.set(c.id, connectorId);
          return { id: connectorId, kind: 'open', width: c.width, direction: c.direction,
            position: { x: c.position.x, y: c.position.y } };
        }) } };
  });
  const connections = included.map((c, i): Connection => {
    const fromRoomId = roomIds.get(c.fromRoomId), toRoomId = roomIds.get(c.toRoomId);
    const fromConnectorId = connectorIds.get(c.fromRoomId)?.get(c.fromConnectorId);
    const toConnectorId = connectorIds.get(c.toRoomId)?.get(c.toConnectorId);
    if (!fromRoomId || !toRoomId || !fromConnectorId || !toConnectorId || !['corridor', 'door', 'stairs', 'secret'].includes(c.type)) {
      throw new Error('出力対象の接続に不正な部屋・接続口の参照があります。');
    }
    return { id: `connection-${String(i).padStart(8, '0')}`, fromRoomId, toRoomId, fromConnectorId, toConnectorId, type: c.type };
  });
  return { audience, rooms, connections };
}

/** Adapt the safe document to the existing pure routing API, without source metadata. */
export function publishRooms(document: PublishDocument): PlacedRoom[] {
  return document.rooms.map(({ label, ...room }) => ({ ...room,
    information: { ...label, description: '', gmNotes: '', tags: [] } }));
}
