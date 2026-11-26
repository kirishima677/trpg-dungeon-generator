import type { PrintProfile } from '../print/printProfile';
import { MAX_PRINT_PAGES } from '../print/printProfile';
import { printAreas, PRINT_EPSILON as E } from '../print/printLayout';
import type { PrintRect } from '../print/printLayout';
import { pieceBounds } from '../../utils/geometry';
import type { PieceInventoryItem, PieceSheetOptions } from './inventory';
import { withPrintQuantities } from './inventory';

export interface PackedPiece extends PrintRect {
  instanceId: string; inventoryItemId: string; rotation: 0 | 90;
  art: PrintRect;
}
export interface PieceSheetPage { index: number; group: string; pieces: PackedPiece[] }
export interface UnplacedPiece { instanceId: string; inventoryItemId: string; name: string; widthMm: number; heightMm: number; reason: 'oversized' | 'page-limit' }
export interface PieceSheetLayout {
  pages: PieceSheetPage[]; unplacedPieces: UnplacedPiece[]; totalPieces: number; cellSizeMm: number;
  contentAreaMm: PrintRect; printableWidthMm: number; printableHeightMm: number;
}
/** Reuse paper/margins/header/ruler without map tiling or registration marks. */
export function pieceSheetPrintProfile(profile: PrintProfile): PrintProfile {
  return { ...profile, target: 'battle-map', map: { ...profile.map, scaleMode: 'physical-grid', showCutMarks: false } };
}
export function validateSheetOptions(options: PieceSheetOptions) {
  if (!['dungeon', 'library', 'corridor-tiles'].includes(options.source)
    || !Number.isFinite(options.pieceGapMm) || options.pieceGapMm < 0 || options.pieceGapMm > 30
    || ['includeGeneratedCorridors', 'allowRotation', 'showGrid', 'showPieceLabels', 'showCutLines', 'showConnectorMarks', 'separateRoomsAndCorridors']
      .some(key => typeof options[key as keyof PieceSheetOptions] !== 'boolean')) throw new Error('ピース間余白は0〜30mmで指定し、表示設定を確認してください。');
}
export function pieceFootprint(item: PieceInventoryItem, rotation: 0 | 90, cell: number, options: PieceSheetOptions) {
  const b = pieceBounds(item.piece, rotation);
  const ink = cell / 40 * 1.5, inset = options.pieceGapMm / 2 + ink;
  return { width: b.w * cell + inset * 2, height: b.h * cell + inset * 2 + (options.showPieceLabels ? 8 : 0),
    artWidth: b.w * cell, artHeight: b.h * cell, inset };
}
const groupFor = (item: PieceInventoryItem, separate: boolean) => !separate ? 'all' : item.category === 'room' ? 'room'
  : item.category === 'other' ? 'other' : 'corridor';

/** Deterministic first-fit decreasing shelves; no scaling, splitting or shape nesting. */
export function buildPieceSheetLayout(input: readonly PieceInventoryItem[], profile: PrintProfile, options: PieceSheetOptions): PieceSheetLayout {
  validateSheetOptions(options);
  const items = withPrintQuantities(input, {}), area = printAreas(pieceSheetPrintProfile(profile)), cell = profile.map.cellSizeMm;
  const b = area.contentAreaMm;
  const expanded = items.flatMap(item => Array.from({ length: item.printQuantity }, (_, i) => ({ item, instanceId: `${item.id}:${i}`,
    size: pieceFootprint(item, 0, cell, options), group: groupFor(item, options.separateRoomsAndCorridors) })));
  expanded.sort((a, z) => {
    const delta = z.size.width * z.size.height - a.size.width * a.size.height
      || Math.max(z.size.width, z.size.height) - Math.max(a.size.width, a.size.height);
    return delta || (a.instanceId < z.instanceId ? -1 : a.instanceId > z.instanceId ? 1 : 0);
  });
  const pages: PieceSheetPage[] = [], unplacedPieces: UnplacedPiece[] = [];
  const shelves: { y: number; height: number; cursor: number }[][] = [];
  for (const entry of expanded) {
    const variants = (options.allowRotation ? [0, 90] as const : [0] as const).map(rotation => ({ rotation,
      ...pieceFootprint(entry.item, rotation, cell, options) }));
    const fitting = variants.filter(s => s.width <= b.width + E && s.height <= b.height + E);
    const omit = (reason: UnplacedPiece['reason']) => unplacedPieces.push({ instanceId: entry.instanceId, inventoryItemId: entry.item.id,
      name: entry.item.name, widthMm: entry.size.width, heightMm: entry.size.height, reason });
    if (!fitting.length) { omit('oversized'); continue; }
    let placed = false;
    const put = (page: PieceSheetPage, shelf: (typeof shelves)[number][number], size: (typeof variants)[number]) => {
      const x = b.x + shelf.cursor, y = b.y + shelf.y;
      page.pieces.push({ instanceId: entry.instanceId, inventoryItemId: entry.item.id, rotation: size.rotation,
        x, y, width: size.width, height: size.height,
        art: { x: x + size.inset, y: y + size.inset, width: size.artWidth, height: size.artHeight } });
      shelf.cursor += size.width; placed = true;
    };
    for (const page of pages) {
      if (page.group !== entry.group) continue;
      for (const shelf of shelves[page.index]) {
        const size = fitting.find(s => shelf.cursor + s.width <= b.width + E && s.height <= shelf.height + E);
        if (size) { put(page, shelf, size); break; }
      }
      if (placed) break;
      const y = shelves[page.index].reduce((sum, s) => sum + s.height, 0);
      const size = [...fitting].sort((a, z) => a.height - z.height || a.rotation - z.rotation).find(s => y + s.height <= b.height + E);
      if (size) { const shelf = { y, height: size.height, cursor: 0 }; shelves[page.index].push(shelf); put(page, shelf, size); break; }
    }
    if (!placed) {
      if (pages.length >= MAX_PRINT_PAGES) { omit('page-limit'); continue; }
      const size = [...fitting].sort((a, z) => a.height - z.height || a.rotation - z.rotation)[0];
      const page = { index: pages.length, group: entry.group, pieces: [] };
      const shelf = { y: 0, height: size.height, cursor: 0 };
      pages.push(page); shelves.push([shelf]); put(page, shelf, size);
    }
  }
  return { pages, unplacedPieces, totalPieces: expanded.length, cellSizeMm: cell,
    contentAreaMm: b, printableWidthMm: area.printableWidthMm, printableHeightMm: area.printableHeightMm };
}

/** Independent verification of the returned rectangles and every requested instance. */
export function validatePieceSheetLayout(layout: PieceSheetLayout, input: readonly PieceInventoryItem[], profile: PrintProfile, options: PieceSheetOptions): string[] {
  validateSheetOptions(options);
  const items = withPrintQuantities(input, {}), area = printAreas(pieceSheetPrintProfile(profile)), b = area.contentAreaMm;
  const errors = new Set<string>(), byId = new Map(items.map(i => [i.id, i]));
  const expected = new Map<string, string>(items.flatMap(i => Array.from({ length: i.printQuantity }, (_, n) => [`${i.id}:${n}`, i.id] as const)));
  const seen = new Set<string>();
  const same = (a: number, z: number) => Number.isFinite(a) && Number.isFinite(z) && Math.abs(a - z) <= E;
  const sameRect = (a: PrintRect, z: PrintRect) => same(a.x, z.x) && same(a.y, z.y) && same(a.width, z.width) && same(a.height, z.height);
  if (!same(layout.cellSizeMm, profile.map.cellSizeMm) || !sameRect(layout.contentAreaMm, b)
    || !same(layout.printableWidthMm, area.printableWidthMm) || !same(layout.printableHeightMm, area.printableHeightMm)) errors.add('用紙・縮尺が設定と一致しません。');
  if (layout.totalPieces !== expected.size || layout.pages.length > MAX_PRINT_PAGES) errors.add('総数・ページ数が不正です。');
  const account = (id: string, materialId: string) => {
    if (seen.has(id) || expected.get(id) !== materialId) errors.add('素材の重複または未指定の素材があります。'); seen.add(id);
  };
  layout.pages.forEach((page, index) => {
    if (page.index !== index || !page.pieces.length) errors.add('ページの識別が不正です。');
    page.pieces.forEach((p, n) => {
      account(p.instanceId, p.inventoryItemId);
      const item = byId.get(p.inventoryItemId);
      if (!item) return;
      if (p.rotation !== 0 && (p.rotation !== 90 || !options.allowRotation)) errors.add('回転設定が不正です。');
      // Re-derive size from occupied cells rather than trusting the packer's footprint.
      const xs = item.piece.cells.map(c => c.x), ys = item.piece.cells.map(c => c.y);
      const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
      const artW = (p.rotation === 90 ? h : w) * profile.map.cellSizeMm, artH = (p.rotation === 90 ? w : h) * profile.map.cellSizeMm;
      const inset = options.pieceGapMm / 2 + profile.map.cellSizeMm / 40 * 1.5;
      if (!same(p.width, artW + inset * 2) || !same(p.height, artH + inset * 2 + (options.showPieceLabels ? 8 : 0))
        || !sameRect(p.art, { x: p.x + inset, y: p.y + inset, width: artW, height: artH })) errors.add('素材の寸法・余白・ラベル領域が不正です。');
      if (![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.x < b.x - E || p.y < b.y - E
        || p.x + p.width > b.x + b.width + E || p.y + p.height > b.y + b.height + E) errors.add('素材が印刷可能領域を超えています。');
      if (page.group !== groupFor(item, options.separateRoomsAndCorridors)) errors.add('素材の分類が不正です。');
      for (const other of page.pieces.slice(n + 1)) {
        if (p.x < other.x + other.width - E && p.x + p.width > other.x + E
          && p.y < other.y + other.height - E && p.y + p.height > other.y + E) errors.add('素材同士が重なっています。');
      }
    });
  });
  for (const p of layout.unplacedPieces) account(p.instanceId, p.inventoryItemId);
  if (seen.size !== expected.size || [...expected.keys()].some(id => !seen.has(id))) errors.add('必要な印刷素材が不足しています。');
  if (layout.unplacedPieces.length) errors.add(`未配置の素材が${layout.unplacedPieces.length}枚あります。用紙・方向・余白・寸法または印刷数を調整してください。`);
  return [...errors];
}
