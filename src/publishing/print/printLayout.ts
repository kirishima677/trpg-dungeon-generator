import { GRID_SIZE } from '../../editor/grid';
import type { MapBounds } from '../mapBounds';
import { CUT_GUTTER_MM, LABEL_HEIGHT_MM, MAX_PRINT_PAGES, SCALE_HEIGHT_MM, printPaper, validatePrintProfile } from './printProfile';
import type { PrintProfile } from './printProfile';

export interface PrintRect { x: number; y: number; width: number; height: number }
export interface PrintPage {
  index: number; label: string; row: number; column: number;
  /** Source and cutBounds are SVG units, never pixels or millimeters. */
  sourceBounds: PrintRect; cutBounds: PrintRect; contentBoundsMm: PrintRect;
}
export interface PrintLayout {
  paperWidthMm: number; paperHeightMm: number; printableWidthMm: number; printableHeightMm: number;
  rows: number; columns: number; pages: PrintPage[];
  mapWidthMm: number; mapHeightMm: number; cellSizeMm: number; overlapMm: number;
  sourceBounds: PrintRect; contentAreaMm: PrintRect;
}
export const PRINT_EPSILON = 1e-8;
export const gridToMm = (cells: number, cellSizeMm: number) => cells * cellSizeMm;
export const svgToMm = (units: number, cellSizeMm: number) => units / GRID_SIZE * cellSizeMm;
export const mmToSvg = (mm: number, cellSizeMm: number) => mm / cellSizeMm * GRID_SIZE;
const ceil = (n: number) => Math.ceil(n - PRINT_EPSILON);
const floor = (n: number) => Math.floor(n + PRINT_EPSILON);

export function printAreas(profile: PrintProfile) {
  validatePrintProfile(profile);
  const paper = printPaper(profile), m = profile.marginsMm;
  const printableWidthMm = paper.width - m.left - m.right, printableHeightMm = paper.height - m.top - m.bottom;
  const battle = profile.target === 'battle-map';
  const gutter = battle && profile.map.showCutMarks ? CUT_GUTTER_MM : 0;
  const header = profile.showPageLabels ? LABEL_HEIGHT_MM : 0;
  const footer = battle && profile.map.showScaleBar ? SCALE_HEIGHT_MM : 0;
  const contentAreaMm = { x: gutter, y: header + gutter, width: printableWidthMm - 2 * gutter,
    height: printableHeightMm - header - footer - 2 * gutter };
  if (contentAreaMm.width <= 0 || contentAreaMm.height <= 0
    || ((profile.showPageLabels || (battle && profile.map.showScaleBar)) && printableWidthMm < 20)) {
    throw new Error('ラベル・目盛り・カットマーク用の領域を確保できません。余白や表示設定を変更してください。');
  }
  return { paperWidthMm: paper.width, paperHeightMm: paper.height, printableWidthMm, printableHeightMm, contentAreaMm };
}
export function rowLabel(row: number) {
  let label = '', n = row + 1;
  while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}
function sourceRect(bounds: MapBounds, align: boolean): PrintRect {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
    || bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) throw new Error('マップの描画範囲が不正です。');
  const minX = align ? floor(bounds.minX) : bounds.minX, minY = align ? floor(bounds.minY) : bounds.minY;
  const maxX = align ? ceil(bounds.maxX) : bounds.maxX, maxY = align ? ceil(bounds.maxY) : bounds.maxY;
  return { x: minX * GRID_SIZE, y: minY * GRID_SIZE, width: (maxX - minX) * GRID_SIZE, height: (maxY - minY) * GRID_SIZE };
}
/** Pure, grid-aware layout. Overlap extends past an integer-grid joining edge. */
export function buildPrintLayout(bounds: MapBounds, profile: PrintProfile): PrintLayout {
  const areas = printAreas(profile), area = areas.contentAreaMm;
  if (profile.target === 'scenario-guide') throw new Error('シナリオ文書のページ分割はブラウザで行います。');
  const battle = profile.target === 'battle-map', source = sourceRect(bounds, battle);
  if (!battle) {
    const scale = Math.min(area.width / source.width, area.height / source.height);
    const width = source.width * scale, height = source.height * scale;
    return { ...areas, rows: 1, columns: 1, sourceBounds: source, cellSizeMm: scale * GRID_SIZE, overlapMm: 0,
      mapWidthMm: width, mapHeightMm: height, pages: [{ index: 0, row: 0, column: 0, label: 'A-1', sourceBounds: source,
        cutBounds: source, contentBoundsMm: { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height } }] };
  }
  const cell = profile.map.cellSizeMm, overlap = profile.map.tileOverlapMm;
  if (overlap >= area.width || overlap >= area.height) throw new Error('重複領域が大きすぎます。ページ間の移動量を確保してください。');
  const widthCells = source.width / GRID_SIZE, heightCells = source.height / GRID_SIZE;
  const fitsX = widthCells * cell <= area.width + PRINT_EPSILON, fitsY = heightCells * cell <= area.height + PRINT_EPSILON;
  const stepX = fitsX ? widthCells : floor((area.width - overlap) / cell), stepY = fitsY ? heightCells : floor((area.height - overlap) / cell);
  if (stepX < 1 || stepY < 1) throw new Error('グリッド境界に沿った分割に必要な1セル分の領域がありません。寸法・余白・重複領域を変更してください。');
  const windowX = fitsX ? widthCells : stepX + overlap / cell, windowY = fitsY ? heightCells : stepY + overlap / cell;
  const columns = Math.max(1, 1 + ceil((widthCells - windowX) / stepX));
  const rows = Math.max(1, 1 + ceil((heightCells - windowY) / stepY));
  if (!Number.isSafeInteger(rows * columns) || rows * columns > MAX_PRINT_PAGES) throw new Error(`分割印刷は${MAX_PRINT_PAGES}ページまでです。用紙やグリッド寸法を変更してください。`);
  if (!profile.map.allowTiling && rows * columns > 1) throw new Error('実寸では1ページに収まりません。分割印刷を有効にしてください。');
  const pages: PrintPage[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const width = windowX * cell, height = windowY * cell;
    const x = source.x + column * stepX * GRID_SIZE, y = source.y + row * stepY * GRID_SIZE;
    pages.push({ index: pages.length, label: `${rowLabel(row)}-${column + 1}`, row, column,
      sourceBounds: { x, y, width: windowX * GRID_SIZE, height: windowY * GRID_SIZE },
      cutBounds: { x, y, width: Math.min(stepX * GRID_SIZE, source.x + source.width - x), height: Math.min(stepY * GRID_SIZE, source.y + source.height - y) },
      contentBoundsMm: { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height } });
  }
  const last = pages.at(-1)!;
  if (last.sourceBounds.x + last.sourceBounds.width < source.x + source.width - PRINT_EPSILON
    || last.sourceBounds.y + last.sourceBounds.height < source.y + source.height - PRINT_EPSILON) throw new Error('ページ分割でマップ全体を覆えませんでした。');
  return { ...areas, rows, columns, pages, sourceBounds: source, cellSizeMm: cell,
    mapWidthMm: gridToMm(widthCells, cell), mapHeightMm: gridToMm(heightCells, cell), overlapMm: rows * columns > 1 ? overlap : 0 };
}
