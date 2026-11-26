export const PAPER_SIZES = {
  A5: { width: 148, height: 210 }, A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 }, Letter: { width: 215.9, height: 279.4 },
} as const;
export type PaperSize = keyof typeof PAPER_SIZES;
export type PrintTarget = 'scenario-guide' | 'reference-map' | 'battle-map';
export interface PrintProfile {
  target: PrintTarget;
  paperSize: PaperSize;
  orientation: 'portrait' | 'landscape';
  marginsMm: { top: number; right: number; bottom: number; left: number };
  showPageLabels: boolean;
  map: { scaleMode: 'fit-page' | 'physical-grid'; cellSizeMm: number; allowTiling: boolean;
    tileOverlapMm: number; showCutMarks: boolean; showScaleBar: boolean };
}
export const MIN_CELL_SIZE_MM = 5;
export const MAX_CELL_SIZE_MM = 100;
export const MAX_PRINT_PAGES = 100;
export const MAX_PRINT_DOCUMENT_BYTES = 16 * 1024 * 1024;
export const MAX_PRINT_MAP_CELLS = 32_768;
export const LABEL_HEIGHT_MM = 10;
export const SCALE_HEIGHT_MM = 8;
export const CUT_GUTTER_MM = 3;
export function defaultPrintProfile(target: PrintTarget = 'scenario-guide'): PrintProfile {
  return { target, paperSize: 'A4', orientation: 'portrait', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
    showPageLabels: true, map: { scaleMode: target === 'battle-map' ? 'physical-grid' : 'fit-page', cellSizeMm: 25.4,
      allowTiling: true, tileOverlapMm: 0, showCutMarks: true, showScaleBar: true } };
}
export function changePrintTarget(profile: PrintProfile, target: PrintTarget): PrintProfile {
  return { ...profile, target, map: { ...profile.map, scaleMode: target === 'battle-map' ? 'physical-grid' : 'fit-page' } };
}
export function printPaper(profile: PrintProfile) {
  const size = PAPER_SIZES[profile.paperSize];
  if (!size) throw new Error('用紙サイズが不正です。');
  return profile.orientation === 'landscape' ? { width: size.height, height: size.width } : { ...size };
}
export function validatePrintProfile(profile: PrintProfile) {
  if (!profile || !['scenario-guide', 'reference-map', 'battle-map'].includes(profile.target)
    || !['portrait', 'landscape'].includes(profile.orientation) || !profile.map
    || profile.map.scaleMode !== (profile.target === 'battle-map' ? 'physical-grid' : 'fit-page')
    || [profile.showPageLabels, profile.map.allowTiling, profile.map.showCutMarks, profile.map.showScaleBar].some(v => typeof v !== 'boolean')) {
    throw new Error('印刷設定が不正です。');
  }
  const paper = printPaper(profile), m = profile.marginsMm;
  if (!m || [m.top, m.right, m.bottom, m.left].some(v => !Number.isFinite(v) || v < 0)
    || m.left + m.right >= paper.width || m.top + m.bottom >= paper.height) throw new Error('余白が不正です。用紙内に印刷可能領域を確保してください。');
  if (!Number.isFinite(profile.map.cellSizeMm) || profile.map.cellSizeMm < MIN_CELL_SIZE_MM || profile.map.cellSizeMm > MAX_CELL_SIZE_MM) {
    throw new Error(`1マスの寸法は${MIN_CELL_SIZE_MM}〜${MAX_CELL_SIZE_MM}mmで指定してください。`);
  }
  if (!Number.isFinite(profile.map.tileOverlapMm) || profile.map.tileOverlapMm < 0 || profile.map.tileOverlapMm > 100) throw new Error('重複領域は0〜100mmで指定してください。');
}
