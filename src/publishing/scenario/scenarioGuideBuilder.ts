import type { ScenarioPublishDocument } from '../publishDocumentBuilder';
import type { PublishMapGeometry } from '../publishMapGeometry';
import type { PublishProfile } from '../publishProfile';
import { renderPublishSvg } from '../PublishMapRenderer';
import { guideMapProfile, validateScenarioGuideOptions } from './scenarioGuide';
import type { ScenarioGuide, ScenarioGuideOptions } from './scenarioGuide';

export function buildScenarioGuide(document: ScenarioPublishDocument, options: ScenarioGuideOptions,
  map?: { audience: PublishProfile['audience']; svg: string }): ScenarioGuide {
  validateScenarioGuideOptions(options);
  if (options.includeMap && !map) throw new Error('マップを生成できません。「マップを含める」をオフにして出力するか、元の配置を修正してください。');
  if (map && map.audience !== document.audience) throw new Error('ガイドとマップの出力対象が一致しません。');
  return { ...document.scenario, audience: document.audience, includeTableOfContents: options.includeTableOfContents,
    ...(options.includeMap ? { mapSvg: map!.svg } : {}) };
}

/** Reuse physical geometry, replacing only labels with the guide's public labels. */
export function renderScenarioMap(geometry: PublishMapGeometry, document: ScenarioPublishDocument, profile: PublishProfile) {
  if (document.audience !== profile.audience || geometry.document.audience !== document.audience) throw new Error('マップの出力対象が一致しません。');
  const labels = new Map(document.scenario.rooms.map(room => [room.mapRoomId, room]));
  if (labels.size !== geometry.rooms.length || geometry.rooms.some(r => !labels.has(r.room.id))) throw new Error('ガイドとマップの部屋が一致しません。');
  const rooms = geometry.rooms.map(entry => {
    const label = labels.get(entry.room.id)!;
    return { ...entry, room: { ...entry.room, piece: { ...entry.room.piece, name: '' },
      information: { ...entry.room.information, number: label.number, name: label.name ?? '' } } };
  });
  return renderPublishSvg({ ...geometry, rooms }, guideMapProfile(profile));
}
