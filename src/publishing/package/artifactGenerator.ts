import type { DungeonDocument } from '../../model/types';
import { buildPieceExport } from '../../editor/pieces/pieceJson';
import { buildExportEnvelope, parseImport } from '../../utils/exportImport';
import type { PublishAudience, PublishProfile } from '../publishProfile';
import { validatePublishProfile } from '../publishProfile';
import { svgToPng, validatePngDimensions } from '../exporters';
import type { ScenarioGuideOptions } from '../scenario/scenarioGuide';
import { changePrintTarget } from '../print/printProfile';
import type { PrintProfile } from '../print/printProfile';
import type { PieceSheetSelection } from '../pieceSheet/inventory';
import { createPublicationSession } from '../publicationSession';
import { issueMessages, publicationIssue, needsAcknowledgement, PublicationIssueError } from '../publicationIssues';
import type { PublicationIssue } from '../publicationIssues';
import { inventoryCsv, packageArtifact } from './packageFiles';
import { MAX_PACKAGE_PNG_PIXELS, MAX_PACKAGE_PRINT_PAGES, referencedCustomPieces } from './packagePlan';
import type { PackageArtifactRequest } from './packagePlan';

export interface PackageSettings { publish: PublishProfile; guides: Record<PublishAudience, ScenarioGuideOptions>; print: PrintProfile; pieces: PieceSheetSelection }
export function packagePublishProfile(base: PublishProfile, audience: PublishAudience): PublishProfile {
  validatePublishProfile(base);
  // A package has no room-level public-name approval. Player artifacts always omit room names.
  return { ...base,...(base.showFactions!==undefined?{showFactions:audience==='gm'&&base.showFactions}:{}), audience, showRoomNames: audience === 'gm' && (base.audience !== 'gm' || base.showRoomNames),
    showRoomNumbers: audience === base.audience ? base.showRoomNumbers : audience === 'gm' };
}
/** Generators receive a captured snapshot and return data; none download files or open print windows. */
export function createArtifactGenerator(source: DungeonDocument, settings: PackageSettings, title: string,
  allowIncomplete = false, png = svgToPng, createdAt = new Date().toISOString()) {
  const session = createPublicationSession(source), warnings = new Set<string>();
  let pngPixels = 0, printPages = 0;
  const warn = (audience: PublishAudience, issues: PublicationIssue[]) => {
    if (!issues.length) return;
    const text = `${audience.toUpperCase()}: ${issueMessages(issues).join(' ')}`;
    if (needsAcknowledgement(issues) && !allowIncomplete) throw new PublicationIssueError(issues, ' 警告を確認し、出力の許可を選択してください。', `${audience.toUpperCase()}: `);
    warnings.add(text);
  };
  const profile = (audience: PublishAudience) => packagePublishProfile(settings.publish, audience);
  const geometryIssues = (audience: PublishAudience) => { session.assertMapCells(); warn(audience, session.mapIssues(audience)); };
  const map = (audience: PublishAudience) => { geometryIssues(audience); return session.map(profile(audience)); };
  const guide = (audience: PublishAudience) => {
    const value = session.guide(profile(audience), settings.guides[audience], title);
    if (settings.guides[audience].includeMap) geometryIssues(audience);
    return value.html;
  };
  const inventory = (audience: PublishAudience) => {
    if (settings.pieces.options.source === 'dungeon') geometryIssues(audience);
    const value = session.inventory(audience, settings.pieces, 'package');
    warn(audience, value.issues);
    if (value.items.some(i => i.printQuantity < i.requiredQuantity)) warn(audience, [publicationIssue('insufficient-quantity', '必要数量より印刷数が少ない素材があります。')]);
    return value;
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
      case 'scenario-print': { guide(audience); data = session.guidePrint(profile(audience), settings.guides[audience], changePrintTarget(settings.print, 'scenario-guide'), title); break; }
      case 'reference-map-print': case 'battle-map-print': {
        const print = changePrintTarget(settings.print, request.kind === 'battle-map-print' ? 'battle-map' : 'reference-map');
        map(audience); const value = session.mapPrint(profile(audience), print, title); countPages(value.layout.pages.length);
        data = value.html; break;
      }
      case 'piece-sheets': {
        inventory(audience); const value = session.pieceSheet(audience, settings.pieces, settings.print, 'package'); countPages(value.layout.pages.length);
        data = value.html(); break;
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
