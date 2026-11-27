import type { ContentDefinition, ContentKind } from '../../src/model/content';
import type { DungeonDocument } from '../../src/model/types';
import { DEFAULT_PIECES } from '../../src/model/pieceLibrary';
import { emptyRoomInformation } from '../../src/model/roomInformation';
export const entityTimestamp = '2026-11-27T00:00:00.000Z';
export function contentFixture(kind: ContentKind = 'monster'): ContentDefinition {
  return { id: `ENTITY_PRIVATE_CONTENT_${kind}`, kind, name: `ENTITY_PRIVATE_NAME_${kind}`, summary: 'ENTITY_PRIVATE_SUMMARY',
    description: '## ENTITY_PRIVATE_DEFINITION\n**素材の説明**', gmNotes: 'ENTITY_PRIVATE_DEFINITION_GM',
    tags: ['ENTITY_PRIVATE_TAG'], attributes: { ENTITY_PRIVATE_ATTRIBUTE: 'ENTITY_PRIVATE_VALUE', hp: 7, alive: true }, createdAt: entityTimestamp, updatedAt: entityTimestamp };
}
export function entityDungeon(): DungeonDocument {
  return { id: 'entity-dungeon', name: 'Entityの検証', version: '1.3.0', rooms: [0, 12].map((x, n) => ({
    id: `room-${n}`, pieceId: DEFAULT_PIECES[0].id, piece: structuredClone(DEFAULT_PIECES[0]), position: { x, y: 0 }, rotation: 0,
    information: emptyRoomInformation(String(n + 1).padStart(2, '0')) })), entities: [],
    connections: [{ id: 'link', type: 'corridor', fromRoomId: 'room-0', toRoomId: 'room-1', fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west' }],
    markdown: '# シナリオ', meta: { gridSize: 40 }, createdAt: entityTimestamp, updatedAt: entityTimestamp };
}
