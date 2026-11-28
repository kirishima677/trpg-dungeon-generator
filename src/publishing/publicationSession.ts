import {buildFactionOverlay} from '../factions/factionOverlay';
import {normalizeFactionState} from '../model/factionState';
import type { DungeonDocument } from '../model/types';
import type { PublishAudience, PublishProfile } from './publishProfile';
import { buildPublishDocument, buildScenarioPublishDocument } from './publishDocumentBuilder';
import { buildPublishMapGeometry } from './publishMapGeometry';
import { renderPublishSvg } from './PublishMapRenderer';
import { buildScenarioGuide, renderScenarioMap } from './scenario/scenarioGuideBuilder';
import { createScenarioHtmlRenderer } from './scenario/scenarioHtmlRenderer';
import type { ScenarioGuideOptions } from './scenario/scenarioGuide';
import { buildPrintLayout } from './print/printLayout';
import type { PrintProfile } from './print/printProfile';
import { MAX_PRINT_MAP_CELLS } from './print/printProfile';
import { renderMapPrintDocument, renderScenarioPrintDocument } from './print/printDocument';
import { buildCorridorInventory, buildDungeonInventory, buildLibraryInventory, withPrintQuantities } from './pieceSheet/inventory';
import type { PieceInventory, PieceInventoryItem, PieceSheetOptions, PieceSheetSelection } from './pieceSheet/inventory';
import { buildPieceSheetLayout, validatePieceSheetLayout } from './pieceSheet/layout';
import { renderPieceSheetDocument } from './pieceSheet/renderer';
import { unresolvedConnectionIssues } from './publicationIssues';

type Entry<T> = { key: string; value: T };
function lastPerAudience<T>() {
  const cache = new Map<PublishAudience, Entry<T>>();
  return (audience: PublishAudience, key: string, build: () => T): T => {
    const previous = cache.get(audience);
    if (previous?.key === key) return previous.value;
    const value = build(); cache.set(audience, { key, value }); return value;
  };
}
/** Layout and renderer are shared by the individual preview and ZIP generator. */
export function preparePieceSheet(items: readonly PieceInventoryItem[], profile: PrintProfile, options: PieceSheetOptions) {
  const layout = buildPieceSheetLayout(items, profile, options);
  const issues = validatePieceSheetLayout(layout, items, profile, options);
  return { layout, issues, html: (pageIndex?: number) => renderPieceSheetDocument(items, layout, profile, options, pageIndex) };
}

/** One fixed snapshot; only the latest visual result per audience is retained. No UI, downloads or ZIP state. */
export function createPublicationSession(snapshot: DungeonDocument | null, buildGeometry = buildPublishMapGeometry) {
  const source = snapshot ? structuredClone(snapshot) : null;
  const requireSource = () => { if (!source) throw new Error('編集画面からデータを取得できません。'); return source; };
  const geometries = new Map<PublishAudience, ReturnType<typeof buildPublishMapGeometry>>();
  const mapCache = lastPerAudience<ReturnType<typeof renderPublishSvg>>();
  const guideMapCache = lastPerAudience<ReturnType<typeof renderScenarioMap>>();
  const guideCache = lastPerAudience<ReturnType<typeof prepareGuide>>();
  const printCache = lastPerAudience<ReturnType<typeof prepareMapPrint>>();
  const inventoryCache = new Map<PublishAudience, { source: string; include: boolean; library: PieceSheetSelection['library'];
    policy: 'individual' | 'package'; inventory: PieceInventory; quantities: PieceSheetSelection['quantities'] | null; selected: PieceInventory | null }>();
  const renderHtml = createScenarioHtmlRenderer();
  const assertMapCells = (message = `部屋床は${MAX_PRINT_MAP_CELLS.toLocaleString()}セルまでです。`) => {
    if (requireSource().rooms.reduce((sum, room) => sum + (room.piece?.cells.length ?? 0), 0) > MAX_PRINT_MAP_CELLS) throw new Error(message);
  };
  const geometry = (audience: PublishAudience) => {
    if (!geometries.has(audience)) geometries.set(audience, buildGeometry(buildPublishDocument(requireSource(), audience)));
    return geometries.get(audience)!;
  };
  const map = (profile: PublishProfile) => mapCache(profile.audience, JSON.stringify(profile), () => renderPublishSvg(geometry(profile.audience), profile,profile.audience==='gm'&&profile.showFactions?buildFactionOverlay({...requireSource(),...normalizeFactionState(requireSource(),requireSource().rooms,requireSource().entities??[])}):undefined));
  function prepareGuide(profile: PublishProfile, options: ScenarioGuideOptions, title: string) {
    const document = buildScenarioPublishDocument({ ...requireSource(), name: title }, profile, options);
    let svg: ReturnType<typeof renderScenarioMap> | null = null;
    if (options.includeMap) {
      assertMapCells('ガイドの部屋床は32,768セルまでです。「マップを含める」をオフにして出力できます。');
      const labels = document.scenario.rooms.map(room => [room.mapRoomId, room.number, room.name]);
      svg = guideMapCache(profile.audience, JSON.stringify([profile, labels]), () => renderScenarioMap(geometry(profile.audience), document, profile));
    }
    const html = renderHtml(buildScenarioGuide(document, options, svg ? { audience: profile.audience, svg: svg.svg } : undefined));
    return { document, map: svg, html };
  }
  const guide = (profile: PublishProfile, options: ScenarioGuideOptions, title = source?.name ?? '') =>
    guideCache(profile.audience, JSON.stringify([profile, options, title]), () => prepareGuide(profile, options, title));
  function prepareMapPrint(profile: PublishProfile, print: PrintProfile, title: string) {
    assertMapCells();
    const svg = map({...profile,showFactions:undefined}), layout = buildPrintLayout(svg.bounds, print);
    return { map: svg, layout, html: renderMapPrintDocument(svg.svg, layout, print, title, profile.audience) };
  }
  const mapPrint = (profile: PublishProfile, print: PrintProfile, title = source?.name ?? '', pageIndex?: number) => {
    const value = printCache(profile.audience, JSON.stringify([profile, print, title]), () => prepareMapPrint(profile, print, title));
    return pageIndex === undefined ? value : { ...value,
      html: renderMapPrintDocument(value.map.svg, value.layout, print, title, profile.audience, pageIndex) };
  };
  const baseInventory = (audience: PublishAudience, selection: PieceSheetSelection, policy: 'individual' | 'package') => {
    const { options, library } = selection;
    let cached = inventoryCache.get(audience);
    if (!cached || cached.source !== options.source || cached.include !== options.includeGeneratedCorridors || cached.library !== library || cached.policy !== policy) {
      const value = options.source === 'dungeon' ? buildDungeonInventory(requireSource(), audience, options.includeGeneratedCorridors, () => geometry(audience))
        : options.source === 'corridor-tiles' ? buildCorridorInventory()
        : library ? buildLibraryInventory(library, policy === 'package' ? audience : 'gm')
        : (() => { throw new Error('ピース印刷でライブラリを取得し、素材を選択してください。'); })();
      cached = { source: options.source, include: options.includeGeneratedCorridors, library, policy, inventory: value, quantities: null, selected: null };
      inventoryCache.set(audience, cached);
    }
    return cached;
  };
  const materials = (audience: PublishAudience, selection: PieceSheetSelection, policy: 'individual' | 'package' = 'individual') => baseInventory(audience, selection, policy).inventory;
  const inventory = (audience: PublishAudience, selection: PieceSheetSelection, policy: 'individual' | 'package' = 'individual') => {
    const cached = baseInventory(audience, selection, policy), quantities = selection.quantities;
    if (cached.quantities !== quantities || !cached.selected) {
      cached.selected = { ...cached.inventory, items: withPrintQuantities(cached.inventory.items, quantities) }; cached.quantities = quantities;
    }
    return cached.selected;
  };
  return { geometry, map, guide, mapPrint, materials, inventory, assertMapCells,
    mapIssues: (audience: PublishAudience) => unresolvedConnectionIssues(geometry(audience).unresolvedCount),
    guidePrint: (profile: PublishProfile, options: ScenarioGuideOptions, print: PrintProfile, title = source?.name ?? '') =>
      renderScenarioPrintDocument(guide(profile, options, title).html, print),
    pieceSheet: (audience: PublishAudience, selection: PieceSheetSelection, print: PrintProfile, policy: 'individual' | 'package' = 'individual') =>
      preparePieceSheet(inventory(audience, selection, policy).items, print, selection.options),
  };
}
export type PublicationSession = ReturnType<typeof createPublicationSession>;
