import {buildFactionGuides} from './scenario/factionGuide';
import type { Connection, DungeonDocument, PlacedRoom } from '../model/types';
import { pieceErrors } from '../editor/pieces/pieceDefinition';
import { roomDisplayName } from '../model/roomInformation';
import type { PublishAudience } from './publishProfile';
import type { PublishProfile } from './publishProfile';
import { validatePublishProfile } from './publishProfile';
import type { PublishScenario, ScenarioGuideOptions } from './scenario/scenarioGuide';
import { compareRoomNumbers, MAX_GUIDE_ROOMS, MAX_GUIDE_TEXT_CHARS, MAX_MARKDOWN_CHARS, roomAnchor, validateScenarioGuideOptions } from './scenario/scenarioGuide';
import { buildEntityGuides } from './scenario/entityGuide';

export type PublishRoom = Omit<PlacedRoom, 'information' | 'roomTheme'> & { label: { number: string; name: string } };
export interface PublishDocument {
  audience: PublishAudience;
  rooms: PublishRoom[];
  connections: Connection[];
  scenario?: PublishScenario;
}

export type ScenarioPublishDocument = Pick<PublishDocument, 'audience'> & { scenario: PublishScenario };

/** Map-independent extraction lets a guide still be exported when geometry is invalid. */
export function buildScenarioPublishDocument(source: DungeonDocument, profile: PublishProfile, options: ScenarioGuideOptions): ScenarioPublishDocument {
  validatePublishProfile(profile);
  validateScenarioGuideOptions(options);
  if (!['player', 'gm'].includes(profile.audience)) throw new Error('出力対象が不正です。');
  if (source.rooms.length > MAX_GUIDE_ROOMS) throw new Error(`ガイドは${MAX_GUIDE_ROOMS}部屋までです。`);
  const gm = profile.audience === 'gm';
  let total = 0;
  const text = (value: string) => {
    if (typeof value !== 'string' || value.length > MAX_MARKDOWN_CHARS) throw new Error(`各テキストは${MAX_MARKDOWN_CHARS.toLocaleString()}文字以内で指定してください。`);
    total += value.length;
    if (total > MAX_GUIDE_TEXT_CHARS) throw new Error(`ガイド全体のテキストは${MAX_GUIDE_TEXT_CHARS.toLocaleString()}文字までです。`);
    return value;
  };
  const factions=buildFactionGuides(source,gm,options.includeGmNotes,text);
  const entities = buildEntityGuides(source, gm, options, text);
  const ids = new Set<string>(), anchors = new Set<string>();
  // Sort IDs first so the rare hash-collision suffix is stable across input order.
  const indexed = source.rooms.map((room, index) => ({ room, index })).sort((a, b) => a.room.id < b.room.id ? -1 : a.room.id > b.room.id ? 1 : 0);
  const rooms = indexed.map(({ room, index }) => {
    if (ids.has(room.id)) throw new Error('部屋IDが重複しています。');
    ids.add(room.id);
    const base = roomAnchor(room.id); let anchorId = base, suffix = 1;
    while (anchors.has(anchorId)) anchorId = `${base}-${suffix++}`;
    anchors.add(anchorId);
    const info = room.information;
    return { anchorId, mapRoomId: `room-${index}`, number: text(info.number),
      ...entities.get(room.id),
      ...(gm&&factions.byRoom.has(room.id)?{factionControl:factions.byRoom.get(room.id)}:{}),
      ...(profile.showRoomNames && info.name.trim() ? { name: text(info.name.trim()) } : {}),
      ...(options.includeRoomDescriptions && info.description.trim() ? { description: text(info.description) } : {}),
      ...(gm && options.includeGmNotes && info.gmNotes.trim() ? { gmNotes: text(info.gmNotes) } : {}),
      ...(gm && options.includeRoomTags && info.tags.length ? { tags: info.tags.map(text) } : {}) };
  }).sort((a, b) => compareRoomNumbers(a.number, b.number) || (a.anchorId < b.anchorId ? -1 : a.anchorId > b.anchorId ? 1 : 0));
  return { audience: profile.audience, scenario: { title: text(source.name), rooms,
    ...(factions.factions.length?{factions:factions.factions}:{}),
    ...(gm && options.includeScenarioMarkdown && source.markdown.trim() ? { scenarioMarkdown: text(source.markdown) } : {}) } };
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
