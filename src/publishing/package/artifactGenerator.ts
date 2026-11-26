import type { DungeonDocument } from '../../model/types';
import { buildPieceExport } from '../../editor/pieces/pieceJson';
import { buildExportEnvelope, parseImport } from '../../utils/exportImport';
import { buildPublishDocument, buildScenarioPublishDocument } from '../publishDocumentBuilder';
import { buildPublishMapGeometry } from '../publishMapGeometry';
import { renderPublishSvg } from '../PublishMapRenderer';
import type { PublishAudience, PublishProfile } from '../publishProfile';
import { validatePublishProfile } from '../publishProfile';
import { svgToPng, validatePngDimensions } from '../exporters';
import type { ScenarioGuideOptions } from '../scenario/scenarioGuide';
import { buildScenarioGuide, renderScenarioMap } from '../scenario/scenarioGuideBuilder';
import { createScenarioHtmlRenderer } from '../scenario/scenarioHtmlRenderer';
import { buildPrintLayout } from '../print/printLayout';
import { renderMapPrintDocument, renderScenarioPrintDocument } from '../print/printDocument';
import { changePrintTarget, MAX_PRINT_MAP_CELLS } from '../print/printProfile';
import type { PrintProfile } from '../print/printProfile';
import { buildCorridorInventory, buildDungeonInventory, buildLibraryInventory, withPrintQuantities } from '../pieceSheet/inventory';
import type { PieceSheetSelection } from '../pieceSheet/inventory';
import { buildPieceSheetLayout } from '../pieceSheet/layout';
import { renderPieceSheetDocument } from '../pieceSheet/renderer';
import { inventoryCsv, packageArtifact } from './packageFiles';
import { MAX_PACKAGE_PNG_PIXELS, MAX_PACKAGE_PRINT_PAGES, referencedCustomPieces } from './packagePlan';
import type { PackageArtifactRequest } from './packagePlan';

export interface PackageSettings { publish: PublishProfile; guides: Record<PublishAudience, ScenarioGuideOptions>; print: PrintProfile; pieces: PieceSheetSelection }
export function packagePublishProfile(base: PublishProfile, audience: PublishAudience): PublishProfile {
  validatePublishProfile(base);
  // A package has no room-level public-name approval. Player artifacts always omit room names.
  return { ...base, audience, showRoomNames: audience === 'gm' && (base.audience !== 'gm' || base.showRoomNames),
    showRoomNumbers: audience === base.audience ? base.showRoomNumbers : audience === 'gm' };
}
/** Generators receive a captured snapshot and return data; none download files or open print windows. */
export function createArtifactGenerator(source: DungeonDocument, settings: PackageSettings, title: string,
  allowIncomplete = false, png = svgToPng, createdAt = new Date().toISOString()) {
  const geometries = new Map<PublishAudience, ReturnType<typeof buildPublishMapGeometry>>();
  const maps = new Map<PublishAudience, ReturnType<typeof renderPublishSvg>>();
  const guides = new Map<PublishAudience, string>();
  const inventories = new Map<PublishAudience, ReturnType<typeof buildDungeonInventory>>();
  const renderHtml = createScenarioHtmlRenderer(), warnings = new Set<string>();
  let pngPixels = 0, printPages = 0;
  const warn = (audience: PublishAudience, messages: string[]) => {
    if (!messages.length) return;
    const text = `${audience.toUpperCase()}: ${messages.join(' ')}`;
    if (!allowIncomplete) throw new Error(`${text} 警告を確認し、出力の許可を選択してください。`);
    warnings.add(text);
  };
  const geometry = (audience: PublishAudience) => {
    if (!geometries.has(audience)) {
      if (source.rooms.reduce((n, r) => n + (r.piece?.cells.length ?? 0), 0) > MAX_PRINT_MAP_CELLS) throw new Error(`部屋床は${MAX_PRINT_MAP_CELLS.toLocaleString()}セルまでです。`);
      geometries.set(audience, buildPublishMapGeometry(buildPublishDocument(source, audience)));
    }
    const value = geometries.get(audience)!;
    if (value.unresolvedCount) warn(audience, [`未解決の接続が${value.unresolvedCount}件あります。`]);
    return value;
  };
  const map = (audience: PublishAudience) => {
    if (!maps.has(audience)) maps.set(audience, renderPublishSvg(geometry(audience), packagePublishProfile(settings.publish, audience)));
    return maps.get(audience)!;
  };
  const guide = (audience: PublishAudience) => {
    if (!guides.has(audience)) {
      const profile = packagePublishProfile(settings.publish, audience), options = settings.guides[audience];
      const document = buildScenarioPublishDocument({ ...source, name: title }, profile, options);
      const svg = options.includeMap ? renderScenarioMap(geometry(audience), document, profile).svg : undefined;
      guides.set(audience, renderHtml(buildScenarioGuide(document, options, svg ? { audience, svg } : undefined)));
    }
    return guides.get(audience)!;
  };
  const inventory = (audience: PublishAudience) => {
    if (!inventories.has(audience)) {
      const selected = settings.pieces;
      const value = selected.options.source === 'dungeon' ? buildDungeonInventory(source, audience, selected.options.includeGeneratedCorridors, () => geometry(audience))
        : selected.options.source === 'corridor-tiles' ? buildCorridorInventory()
        : selected.library ? buildLibraryInventory(selected.library, audience) : (() => { throw new Error('ピース印刷でライブラリを取得し、素材を選択してください。'); })();
      const items = withPrintQuantities(value.items, selected.quantities);
      warn(audience, value.warnings);
      if (items.some(i => i.printQuantity < i.requiredQuantity)) warnings.add(`${audience.toUpperCase()}: 必要数量より印刷数が少ない素材があります。`);
      inventories.set(audience, { ...value, items });
    }
    return inventories.get(audience)!;
  };
  const countPages = (n: number) => {
    printPages += n;
    if (printPages > MAX_PACKAGE_PRINT_PAGES) throw new Error(`印刷マップ・ピースシートの合計は${MAX_PACKAGE_PRINT_PAGES}ページまでです。`);
  };
  return { warnings, async generate(request: PackageArtifactRequest) {
    const audience = request.audience as PublishAudience;
    let data: string | Uint8Array;
    switch (request.kind) {
      case 'map-svg': data = map(audience).svg; break;
      case 'map-png': {
        const svg = map(audience); validatePngDimensions(svg.width, svg.height);
        pngPixels += svg.width * svg.height;
        if (pngPixels > MAX_PACKAGE_PNG_PIXELS) throw new Error('PNGの総画素数が33,554,432を超えています。');
        const blob = await png(svg.svg, svg.width, svg.height, settings.publish.background);
        data = new Uint8Array(await blob.arrayBuffer()); break;
      }
      case 'scenario-guide': data = guide(audience); break;
      case 'scenario-print': data = renderScenarioPrintDocument(guide(audience), changePrintTarget(settings.print, 'scenario-guide')); break;
      case 'reference-map-print': case 'battle-map-print': {
        const profile = changePrintTarget(settings.print, request.kind === 'battle-map-print' ? 'battle-map' : 'reference-map');
        const svg = map(audience), layout = buildPrintLayout(svg.bounds, profile); countPages(layout.pages.length);
        data = renderMapPrintDocument(svg.svg, layout, profile, title, audience); break;
      }
      case 'piece-sheets': {
        const items = inventory(audience).items, options = settings.pieces.options;
        const layout = buildPieceSheetLayout(items, settings.print, options); countPages(layout.pages.length);
        data = renderPieceSheetDocument(items, layout, settings.print, options); break;
      }
      case 'piece-inventory': data = inventoryCsv(inventory(audience).items, audience); break;
      case 'project-json': {
        const envelope = buildExportEnvelope(source); envelope.exportedAt = createdAt;
        parseImport(envelope); data = JSON.stringify(envelope, null, 2); break;
      }
      case 'piece-library-json': {
        const piece = referencedCustomPieces(source).find(p => p.id === request.pieceId);
        if (!piece) throw new Error('参照されるユーザー定義ピースが見つかりません。');
        data = JSON.stringify(buildPieceExport(piece), null, 2); break;
      }
      default: throw new Error('メタデータは成果物生成後に構築してください。');
    }
    return packageArtifact(request, data);
  } };
}
