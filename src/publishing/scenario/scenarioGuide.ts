import type {RoomEncounterGuide} from './encounterGuide';
import type {GuideFaction,GuideRoomFaction} from './factionGuide';
import type { PublishAudience, PublishProfile } from '../publishProfile';
import type { RoomEntityGuide } from './entityGuide';

export interface ScenarioGuideOptions {
  includeMap: boolean;
  includeTableOfContents: boolean;
  includeScenarioMarkdown: boolean;
  includeRoomDescriptions: boolean;
  includeRoomTags: boolean;
  includeGmNotes: boolean;
}
export const MAX_GUIDE_ROOMS = 1000;
export const MAX_GUIDE_MAP_CELLS = 32_768;
export const MAX_MARKDOWN_CHARS = 100_000;
export const MAX_GUIDE_TEXT_CHARS = 1_000_000;
export const MAX_GUIDE_HTML_BYTES = 8 * 1024 * 1024;

export function defaultScenarioGuideOptions(audience: PublishAudience): ScenarioGuideOptions {
  return { includeMap: true, includeTableOfContents: true, includeRoomDescriptions: true,
    includeScenarioMarkdown: audience === 'gm', includeRoomTags: audience === 'gm', includeGmNotes: audience === 'gm' };
}
export function validateScenarioGuideOptions(options: ScenarioGuideOptions) {
  const keys = Object.keys(defaultScenarioGuideOptions('player')) as (keyof ScenarioGuideOptions)[];
  if (!options || keys.some(key => typeof options[key] !== 'boolean')) throw new Error('シナリオガイドの出力設定が不正です。');
}
export interface ScenarioGuideRoom extends RoomEntityGuide,RoomEncounterGuide {
  factionControl?:GuideRoomFaction;
  anchorId: string;
  mapRoomId: string;
  number: string;
  name?: string;
  description?: string;
  gmNotes?: string;
  tags?: string[];
}
/** Safe content extracted before any Markdown/HTML renderer runs. */
export interface PublishScenario {
  factions?:GuideFaction[];
  title: string;
  scenarioMarkdown?: string;
  rooms: ScenarioGuideRoom[];
}
export interface ScenarioGuide extends PublishScenario {
  audience: PublishAudience;
  includeTableOfContents: boolean;
  mapSvg?: string;
}

/** Locale-independent natural order; no number precision loss or array mutation. */
export function compareRoomNumbers(a: string, b: string): number {
  const left = a.match(/\d+|\D+/gu) ?? [], right = b.match(/\d+|\D+/gu) ?? [];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i], y = right[i];
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      const nx = x.replace(/^0+/, '') || '0', ny = y.replace(/^0+/, '') || '0';
      if (nx.length !== ny.length) return nx.length - ny.length;
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length || (a < b ? -1 : a > b ? 1 : 0);
}
/** An internal ID determines the anchor; labels never become identifiers. */
export function roomAnchor(id: string) {
  let hash = 0xcbf29ce484222325n;
  for (const codePoint of id) hash = BigInt.asUintN(64, (hash ^ BigInt(codePoint.codePointAt(0)!)) * 0x100000001b3n);
  return `guide-room-${hash.toString(16).padStart(16, '0')}`;
}
export function guideMapProfile(profile: PublishProfile): PublishProfile {
  return { ...profile, showRoomNumbers: true };
}
