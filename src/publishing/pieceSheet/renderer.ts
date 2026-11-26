import type { PrintProfile } from '../print/printProfile';
import { BATTLE_PRINT_INSTRUCTIONS, checkPrintDocumentSize, escapeHtml, printDocumentStyles, renderPrintScale } from '../print/printDocument';
import type { PieceInventoryItem, PieceSheetOptions } from './inventory';
import type { PieceSheetLayout } from './layout';
import { pieceSheetPrintProfile, validatePieceSheetLayout } from './layout';
import { buildPrintablePiece } from './artwork';
import { GRID_SIZE } from '../../editor/grid';

/** One vector definition per material/orientation, shared by preview and printed pages. */
export function renderPieceSheetDocument(items: readonly PieceInventoryItem[], layout: PieceSheetLayout, profile: PrintProfile,
  options: PieceSheetOptions, pageIndex?: number) {
  const errors = validatePieceSheetLayout(layout, items, profile, options);
  // A partial single-page preview is useful for explaining oversized pieces; never export it as a complete document.
  if (errors.length && (pageIndex === undefined || errors.some(e => !e.startsWith('未配置の素材')))) throw new Error(errors.join(' '));
  if (!layout.totalPieces || !layout.pages.length) throw new Error('印刷する素材を選択してください。');
  const pages = pageIndex === undefined ? layout.pages : [layout.pages[pageIndex]];
  if (pages.some(p => !p)) throw new Error('表示するページがありません。');
  const safeProfile = pieceSheetPrintProfile(profile), byId = new Map(items.map((item, i) => [item.id, { item, index: i }]));
  const art = new Map<string, ReturnType<typeof buildPrintablePiece>>();
  const definitions: string[] = [];
  for (const page of pages) for (const p of page.pieces) {
    const source = byId.get(p.inventoryItemId)!;
    const key = `sheet-art-${source.index}-${p.rotation}`;
    if (!art.has(key)) {
      const shape = buildPrintablePiece(source.item, p.rotation, options);
      art.set(key, shape); definitions.push(`<g id="${key}">${shape.svg}</g>`);
    }
  }
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Dungeon Piece Sheet</title><style>${printDocumentStyles(safeProfile)} .piece-page-svg { position:absolute; inset:0; } </style></head><body>
<div class="print-ui"><p>${BATTLE_PRINT_INSTRUCTIONS}</p><p>${profile.paperSize} / Grid: ${layout.cellSizeMm} mm / ${layout.totalPieces}枚 / 全${layout.pages.length}ページ</p>${layout.unplacedPieces.length ? '<p>未配置の素材があります。このプレビューは完全な印刷シートではありません。</p>' : ''}</div>
<svg class="print-source" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${definitions.join('')}</defs></svg><main>${pages.map(page => {
    const label = profile.showPageLabels ? `<p class="print-page-label"><span>Dungeon Piece Sheet — Grid: ${layout.cellSizeMm} mm</span><span>Page ${page.index + 1} / ${layout.pages.length}</span></p>` : '';
    const shapes = page.pieces.map(p => {
      const source = byId.get(p.inventoryItemId)!, key = `sheet-art-${source.index}-${p.rotation}`, shape = art.get(key)!;
      const a = p.art;
      const title = `${source.item.code} ${source.item.name}`.slice(0, 80);
      const textWidth = Math.min(title.length * 1.7, a.width);
      return `<svg x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" viewBox="0 0 ${shape.widthCells * GRID_SIZE} ${shape.heightCells * GRID_SIZE}" overflow="visible"><use href="#${key}"/></svg>`
        + (options.showPieceLabels ? `<text x="${a.x}" y="${a.y + a.height + 5}" font-size="2.5" fill="#334155" textLength="${textWidth}" lengthAdjust="spacingAndGlyphs">${escapeHtml(title)}</text>` : '');
    }).join('');
    return `<section class="print-sheet" aria-label="Page ${page.index + 1}"><div class="print-page">${label}<svg class="piece-page-svg" xmlns="http://www.w3.org/2000/svg" width="${layout.printableWidthMm}mm" height="${layout.printableHeightMm}mm" viewBox="0 0 ${layout.printableWidthMm} ${layout.printableHeightMm}">${shapes}</svg>${renderPrintScale(safeProfile)}</div></section>`;
  }).join('')}</main></body></html>`;
  return checkPrintDocumentSize(html);
}
