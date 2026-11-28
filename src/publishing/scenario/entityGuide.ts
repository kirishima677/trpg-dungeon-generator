import {factionDisplayName} from '../../model/factionState';
import { CONTENT_KINDS } from '../../model/content';
import type { ContentAttributeValue, ContentKind } from '../../model/content';
import { entityDisplayName, normalizeEntities } from '../../model/entity';
import type { DungeonDocument } from '../../model/types';
import type { ScenarioGuideOptions } from './scenarioGuide';

export interface GmGuideEntity {
  faction?:string; name: string; sourceName: string; quantity: number; summary: string;
  description?: string; definitionGmNotes?: string; tags: string[];
  attributes: Record<string, ContentAttributeValue>; publicDescription?: string; gmNotes?: string;
}
export interface GuideEntityGroup { kind: ContentKind; entries: GmGuideEntity[] }
export interface RoomEntityGuide { entities?: GuideEntityGroup[]; entityDescriptions?: string[] }

/** Player data has only explicitly public descriptions. Never pass source objects to HTML rendering. */
export function buildEntityGuides(source: DungeonDocument, gm: boolean, options: ScenarioGuideOptions, text: (value: string) => string) {
  const entities = normalizeEntities(source.entities, source.rooms), byRoom = new Map<string, RoomEntityGuide>();
  for (const room of source.rooms) {
    const values = entities.filter(e => e.roomId === room.id);
    if (!gm) {
      const descriptions = options.includeRoomDescriptions ? values.filter(e => e.visibility === 'public' && e.publicDescription.trim()).map(e => text(e.publicDescription)) : [];
      if (descriptions.length) byRoom.set(room.id, { entityDescriptions: descriptions });
    } else {
      const groups = CONTENT_KINDS.flatMap(kind => {
        const entries: GmGuideEntity[] = values.filter(e => e.contentSnapshot.kind === kind).map(entity => {
          const snapshot = entity.contentSnapshot;
          return { ...(entity.factionId?{faction:text(factionDisplayName(source.factions.find(f=>f.id===entity.factionId)!))}:{}),name: text(entityDisplayName(entity)), sourceName: text(snapshot.name), quantity: entity.quantity, summary: text(snapshot.summary),
            tags: snapshot.tags.map(text), attributes: Object.fromEntries(Object.entries(snapshot.attributes).map(([key, value]) => {
              text(key); text(String(value)); return [key, value];
            })),
            ...(options.includeRoomDescriptions && snapshot.description.trim() ? { description: text(snapshot.description) } : {}),
            ...(options.includeRoomDescriptions && entity.publicDescription.trim() ? { publicDescription: text(entity.publicDescription) } : {}),
            ...(options.includeGmNotes && snapshot.gmNotes.trim() ? { definitionGmNotes: text(snapshot.gmNotes) } : {}),
            ...(options.includeGmNotes && entity.gmNotes.trim() ? { gmNotes: text(entity.gmNotes) } : {}) };
        });
        return entries.length ? [{ kind, entries }] : [];
      });
      if (groups.length) byRoom.set(room.id, { entities: groups });
    }
  }
  return byRoom;
}
