import type { DungeonDocument, Piece, PlacedRoom } from '../../src/model/types';
import { DEFAULT_PIECES } from '../../src/model/pieceLibrary';
import { emptyRoomInformation } from '../../src/model/roomInformation';
import { defaultPublishProfile } from '../../src/publishing/publishProfile';
import { defaultScenarioGuideOptions } from '../../src/publishing/scenario/scenarioGuide';
import { defaultPrintProfile } from '../../src/publishing/print/printProfile';
import { defaultPieceSheetSelection } from '../../src/publishing/pieceSheet/inventory';
import { defaultPackageProfile } from '../../src/publishing/package/packagePlan';
export const fixtureTimestamp = '2026-11-26T00:00:00.000Z';
export function publicationFixture() {
  const custom: Piece = { ...structuredClone(DEFAULT_PIECES[2]), id: 'custom-fixture', name: '自由形状の素材', shape: 'custom', tags: ['room', 'PRIVATE_PIECE_TAG'] };
  const room = (n: number, piece: Piece, x: number, y: number, rotation: PlacedRoom['rotation'] = 0): PlacedRoom => ({ id: `room-${n}`, pieceId: piece.id,
    piece: structuredClone(piece), position: { x, y }, rotation,
    information: { ...emptyRoomInformation(String(n + 1).padStart(2, '0')), name: `PRIVATE_NAME_${n}`,
      description: '# 公開説明\n\n日本語と **強調**、[リンク](https://example.com)。', gmNotes: `PRIVATE_NOTES_${n}`, tags: ['PRIVATE_TAG'] } });
  const source: DungeonDocument = { id: 'fixture-dungeon', name: '検証用 <古城>', version: '1.2.0', markdown: '# PRIVATE_SCENARIO\n\nGM用の説明。',
    meta: { gridSize: 40 }, createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp,
    rooms: [room(0, DEFAULT_PIECES[0], 0, 0), room(1, DEFAULT_PIECES[0], 12, 0, 90), room(2, DEFAULT_PIECES[0], 0, 12),
      room(3, custom, 8, 12), room(4, DEFAULT_PIECES[3], 20, 12)],
    connections: [{ id: 'normal', type: 'corridor', fromRoomId: 'room-0', toRoomId: 'room-1', fromConnectorId: 'piece-rect-4x4-east', toConnectorId: 'piece-rect-4x4-west' },
      { id: 'PRIVATE_SECRET_ID', type: 'secret', fromRoomId: 'room-0', toRoomId: 'room-2', fromConnectorId: 'piece-rect-4x4-south', toConnectorId: 'piece-rect-4x4-north' }] };
  const settings = { publish: defaultPublishProfile('gm'), guides: { player: defaultScenarioGuideOptions('player'), gm: defaultScenarioGuideOptions('gm') },
    print: defaultPrintProfile(), pieces: defaultPieceSheetSelection() };
  settings.pieces.quantities = { 'piece:piece-rect-4x4': 4 };
  const profile = defaultPackageProfile('complete'); profile.title = '配布用の城'; profile.artifacts.push('piece-library-json');
  return { source, settings, profile };
}
