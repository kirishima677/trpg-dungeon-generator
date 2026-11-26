import type { DungeonDocument, Piece } from '../../model/types';
import type { PublishAudience } from '../publishProfile';
import type { PublishMapGeometry } from '../publishMapGeometry';
import { buildPublishMapGeometry } from '../publishMapGeometry';
import { buildPublishDocument } from '../publishDocumentBuilder';
import { isStandardPiece, normalizePiece, pieceStructure } from '../../editor/pieces/pieceDefinition';
import type { CorridorCell } from '../../editor/connectors/corridor/corridorGeometry';
import { MAX_PRINT_MAP_CELLS } from '../print/printProfile';

export type PieceSheetSource = 'dungeon' | 'library' | 'corridor-tiles';
export type PieceCategory = 'room' | 'manual-corridor' | 'generated-corridor' | 'other';
export interface PieceSheetOptions {
  source: PieceSheetSource; includeGeneratedCorridors: boolean; allowRotation: boolean; pieceGapMm: number;
  showGrid: boolean; showPieceLabels: boolean; showCutLines: boolean; showConnectorMarks: boolean;
  separateRoomsAndCorridors: boolean;
}
export const defaultPieceSheetOptions = (): PieceSheetOptions => ({ source: 'dungeon', includeGeneratedCorridors: true,
  allowRotation: true, pieceGapMm: 3, showGrid: true, showPieceLabels: true, showCutLines: true,
  showConnectorMarks: false, separateRoomsAndCorridors: false });
export interface PieceSheetSelection { options: PieceSheetOptions; quantities: Record<string, number>; library: Piece[] | null }
export const defaultPieceSheetSelection = (): PieceSheetSelection => ({ options: defaultPieceSheetOptions(), quantities: {}, library: null });
export interface PieceInventoryItem {
  id: string; source: 'piece-library' | 'generated-corridor'; pieceId?: string; corridorMask?: number;
  name: string; code: string; category: PieceCategory; standard: boolean; piece: Piece;
  requiredQuantity: number; printQuantity: number;
}
export interface PieceInventory { items: PieceInventoryItem[]; warnings: string[] }
export const MAX_INVENTORY_ITEMS = 256;
export const MAX_QUANTITY_PER_ITEM = 500;
export const MAX_SHEET_PIECES = 1000;
export const CORRIDOR_TILES = [{ mask: 10, name: '直線通路' }, { mask: 3, name: '曲がり角' },
  { mask: 11, name: 'T字路' }, { mask: 15, name: '十字路' }, { mask: 1, name: '終端' }] as const;

export function normalizeCorridorMask(mask: number): number {
  if (!Number.isInteger(mask) || mask < 1 || mask > 15) throw new Error('通路の接続方向が不正です。');
  let rotated = mask;
  for (let i = 0; i < 4; i++) {
    const tile = CORRIDOR_TILES.find(t => t.mask === rotated);
    if (tile) return tile.mask;
    rotated = ((rotated << 1) & 15) | (rotated >> 3);
  }
  throw new Error('未対応の通路形状です。');
}
/** Count the merged network, never the per-connection drawings. */
export function corridorTileCounts(cells: readonly CorridorCell[]) {
  const merged = new Map<string, number>(), counts = new Map<number, number>();
  for (const c of cells) {
    if (!Number.isSafeInteger(c.x) || !Number.isSafeInteger(c.y)) throw new Error('通路セル座標が不正です。');
    normalizeCorridorMask(c.connections);
    const key = `${c.x},${c.y}`;
    merged.set(key, (merged.get(key) ?? 0) | c.connections);
  }
  for (const mask of merged.values()) {
    const canonical = normalizeCorridorMask(mask);
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }
  return counts;
}
function tileItem(mask: number, quantity: number): PieceInventoryItem {
  const name = CORRIDOR_TILES.find(t => t.mask === mask)!.name;
  const piece: Piece = { id: `tile-${mask}`, name, shape: 'corridor', cells: [{ x: 0, y: 0 }],
    connectors: (['north', 'east', 'south', 'west'] as const).flatMap((direction, i) =>
      mask & (1 << i) ? [{ id: `port-${i}`, direction, kind: 'open' as const, width: 1, position: { x: 0, y: 0 } }] : []) };
  return { id: `tile-${mask}`, source: 'generated-corridor', corridorMask: mask, name, code: `C-${mask}`,
    category: 'generated-corridor', standard: true, piece, requiredQuantity: quantity, printQuantity: quantity };
}
export function classifyPiece(piece: Piece): PieceCategory {
  if (piece.shape === 'corridor') return 'manual-corridor';
  if (piece.shape === 'rectangle' || piece.shape === 'l-shape') return 'room';
  if (piece.tags?.includes('corridor')) return 'manual-corridor';
  if (piece.tags?.includes('room')) return 'room';
  return 'other';
}
function material(piece: Piece, index: number, audience: PublishAudience, generic: boolean, publicPorts = new Set<string>()): PieceInventoryItem {
  const normalized = normalizePiece(piece), category = classifyPiece(normalized);
  const code = `${category === 'room' ? 'R' : category === 'manual-corridor' ? 'M' : 'O'}-${String(index + 1).padStart(3, '0')}`;
  const name = generic && audience === 'player' ? code : normalized.name;
  // Copy only template geometry. Room information and tags never reach the artwork.
  const safe: Piece = { id: code, name, shape: normalized.shape, cells: normalized.cells.map(c => ({ ...c })),
    connectors: normalized.connectors.filter(c => audience === 'gm' || c.kind !== 'secret' || publicPorts.has(c.id)).map((c, i) => ({
      id: `port-${i}`, direction: c.direction, kind: audience === 'player' && c.kind === 'secret' ? 'open' : c.kind,
      width: c.width, position: { ...c.position } })) };
  return { id: `piece:${piece.id}`, pieceId: piece.id, source: 'piece-library', name, code, category,
    standard: isStandardPiece(piece.id), piece: safe, requiredQuantity: 0, printQuantity: 0 };
}
export function buildLibraryInventory(pieces: readonly Piece[], audience: PublishAudience = 'gm'): PieceInventory {
  if (pieces.length > MAX_INVENTORY_ITEMS) throw new Error(`素材は${MAX_INVENTORY_ITEMS}種類までです。`);
  const ids = new Set<string>();
  return { warnings: [], items: [...pieces].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((p, i) => {
    if (ids.has(p.id)) throw new Error('ライブラリのPiece IDが重複しています。');
    ids.add(p.id); return material(p, i, audience, audience === 'player');
  }) };
}
export function buildCorridorInventory(): PieceInventory {
  return { warnings: [], items: CORRIDOR_TILES.map(t => ({ ...tileItem(t.mask, 0), printQuantity: 1 })) };
}
export function buildDungeonInventory(source: DungeonDocument, audience: PublishAudience, includeGenerated = true,
  resolve?: () => PublishMapGeometry): PieceInventory {
  if (source.rooms.reduce((n, r) => n + r.piece.cells.length, 0) > MAX_PRINT_MAP_CELLS) throw new Error(`部屋床は${MAX_PRINT_MAP_CELLS.toLocaleString()}セルまでです。`);
  // The same audience-filtered snapshot is routed and counted. No secret IDs or scenario text are returned.
  const geometry = resolve ? resolve() : buildPublishMapGeometry(buildPublishDocument(source, audience));
  if (geometry.document.audience !== audience) throw new Error('公開対象と通路データが一致しません。');
  const groups = new Map<string, { piece: Piece; quantity: number; structure: string }>();
  for (const room of source.rooms) {
    if (room.pieceId !== room.piece.id) throw new Error('Piece参照が不正です。');
    const structure = pieceStructure(normalizePiece(room.piece)), previous = groups.get(room.pieceId);
    if (previous && previous.structure !== structure) throw new Error('同じPiece IDに異なる形状があります。');
    if (previous) previous.quantity++; else groups.set(room.pieceId, { piece: room.piece, quantity: 1, structure });
  }
  if (groups.size > MAX_INVENTORY_ITEMS) throw new Error(`素材は${MAX_INVENTORY_ITEMS}種類までです。`);
  const publicPorts = new Map<string, Set<string>>(), roomsById = new Map(source.rooms.map(r => [r.id, r]));
  for (const c of source.connections.filter(c => audience === 'gm' || c.type !== 'secret')) {
    for (const [roomId, port] of [[c.fromRoomId, c.fromConnectorId], [c.toRoomId, c.toConnectorId]]) {
      const pieceId = roomsById.get(roomId)?.pieceId;
      if (pieceId) { if (!publicPorts.has(pieceId)) publicPorts.set(pieceId, new Set()); publicPorts.get(pieceId)!.add(port); }
    }
  }
  const items = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, g], i) => ({
    ...material(g.piece, i, audience, true, publicPorts.get(g.piece.id)), requiredQuantity: g.quantity, printQuantity: g.quantity }));
  const warnings: string[] = [];
  const special = geometry.document.connections.filter(c => c.type !== 'corridor').length;
  if (special) warnings.push(`専用素材に変換できない特殊接続が${special}件あります。`);
  if (geometry.unresolvedCount) warnings.push(`未解決の接続が${geometry.unresolvedCount}件あります。正常な通路として集計していません。`);
  const counts = corridorTileCounts(geometry.scene.network.cells);
  if (includeGenerated) {
    for (const t of CORRIDOR_TILES) if (counts.has(t.mask)) items.push(tileItem(t.mask, counts.get(t.mask)!));
  } else if (counts.size) warnings.push('自動生成通路を除外しています。');
  if (items.length > MAX_INVENTORY_ITEMS) throw new Error(`素材は${MAX_INVENTORY_ITEMS}種類までです。`);
  if (warnings.length) warnings.push('この印刷シートだけではダンジョン全体を再構成できません。');
  return { items, warnings };
}
export function withPrintQuantities(items: readonly PieceInventoryItem[], quantities: Readonly<Record<string, number>>) {
  if (items.length > MAX_INVENTORY_ITEMS) throw new Error(`素材は${MAX_INVENTORY_ITEMS}種類までです。`);
  let total = 0;
  const ids = new Set<string>();
  return items.map(item => {
    normalizePiece(item.piece);
    if (!Number.isSafeInteger(item.requiredQuantity) || item.requiredQuantity < 0) throw new Error('必要数量が不正です。');
    const quantity = Object.hasOwn(quantities, item.id) ? quantities[item.id] : item.printQuantity;
    if (ids.has(item.id)) throw new Error('素材IDが重複しています。'); ids.add(item.id);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY_PER_ITEM) throw new Error(`印刷数は0〜${MAX_QUANTITY_PER_ITEM}の整数で指定してください。`);
    total += quantity;
    if (total > MAX_SHEET_PIECES) throw new Error(`印刷数の合計は${MAX_SHEET_PIECES}枚までです。`);
    return { ...item, printQuantity: quantity };
  });
}
