import {intersectById} from './selectionSets';
import type { Piece, PlacedRoom, Rotation } from './types';
import type { DungeonTheme } from './dungeonTheme';
import type { RoomThemeDraft, RoomPieceConstraints, RequiredContentEntry } from './roomTheme';
import { normalizeRoomConstraints, normalizeRequiredEntry } from './roomTheme';
import { CONTENT_KINDS } from './content';
import type { ContentDefinition, ContentKind } from './content';
import { emptyPieceSelection, emptyContentSelection, resolvePieceSelection, resolveContentSelection, resolveRoomThemeSelection } from './themeSelection';
import { pieceBounds } from '../utils/geometry';
import { isExteriorConnector } from '../editor/pieces/pieceDefinition';

export interface RoomThemeWarning { code: string; message: string; scope: 'dungeon' | 'room' | 'combined' | 'structure' | 'required'; id?: string; kind?: ContentKind }
export interface ResolvedPieceCandidate { piece: Piece; rotations: Rotation[] }
export interface ResolvedRequiredContent { entry: RequiredContentEntry; content?: ContentDefinition; status: 'resolved' | 'missing' | 'kind-mismatch'; conflict: boolean }
type RoomPolicy = Pick<RoomThemeDraft, 'id' | 'tags' | 'pieceSelection' | 'contentSelection' | 'pieceConstraints' | 'requiredContents'>;
type DungeonPolicy = Pick<DungeonTheme, 'pieceSelection' | 'contentSelection' | 'roomThemeSelection'>;
export interface RoomThemeResolutionInput { dungeonTheme?: DungeonPolicy | null; roomTheme?: RoomPolicy | null; pieces: readonly Piece[]; contents: readonly ContentDefinition[] }

export function evaluateRoomPiece(piece: Piece, constraints: RoomPieceConstraints, rotation: Rotation) {
  const c = normalizeRoomConstraints(constraints), bounds = pieceBounds(piece, rotation);
  const metrics = { Cells: new Set(piece.cells.map(p => `${p.x},${p.y}`)).size,
    Connectors: new Set(piece.connectors.filter(p => Number.isInteger(p.width) && p.width > 0 && isExteriorConnector(piece.cells,p.position,p.direction)).map(p => p.id)).size,
    Width: bounds.w, Height: bounds.h };
  const reasons: string[] = [];
  for (const key of Object.keys(c) as (keyof RoomPieceConstraints)[]) {
    const actual = metrics[key.slice(3) as keyof typeof metrics], limit = c[key]!;
    if (key.startsWith('min') ? actual < limit : actual > limit) reasons.push(`${key}: 現在${actual}、条件${limit}`);
  }
  return { matches: !reasons.length, metrics, reasons };
}
/** Reuses the same Selection Resolver for each layer, then intersects IDs before geometry/requirements. */
export function resolveRoomTheme({ dungeonTheme: dungeon, roomTheme: room, pieces, contents }: RoomThemeResolutionInput) {
  const warnings: RoomThemeWarning[] = [];
  const allPiece = { ...emptyPieceSelection(), mode: 'all' as const }, allContent = emptyContentSelection();
  for (const kind of CONTENT_KINDS) allContent[kind].mode = 'all';
  const dPieces = resolvePieceSelection(dungeon?.pieceSelection ?? allPiece, pieces), rPieces = resolvePieceSelection(room?.pieceSelection ?? allPiece, pieces);
  const dContents = resolveContentSelection(dungeon?.contentSelection ?? allContent, contents), rContents = resolveContentSelection(room?.contentSelection ?? allContent, contents);
  for (const [scope, results, active] of [['dungeon',[dPieces,dContents],dungeon],['room',[rPieces,rContents],room]] as const)
    if (active) for (const result of results) warnings.push(...result.warnings.map(w => ({ ...w, scope })));
  const common = intersectById(rPieces.candidates,[dPieces.candidates]), pieceCandidates: ResolvedPieceCandidate[] = [];
  for (const piece of common) {
    const rotations = ([0,90,180,270] as Rotation[]).filter(rotation => !room || evaluateRoomPiece(piece, room.pieceConstraints, rotation).matches);
    if (rotations.length) pieceCandidates.push({ piece, rotations });
    else warnings.push({ scope:'structure', code:'piece-constraints', id:piece.id, message:`Piece「${piece.name}」はどの回転でも構造条件を満たしません。` });
  }
  if (!pieceCandidates.length) warnings.push({ scope:'combined',code:'empty-pieces',message:'統合したPiece候補がありません。' });
  const contentCandidates = {} as Record<ContentKind,ContentDefinition[]>;
  for (const kind of CONTENT_KINDS) {
    contentCandidates[kind] = intersectById(rContents.candidates[kind],[dContents.candidates[kind]]);
    if (dungeon && room && !contentCandidates[kind].length && (dContents.candidates[kind].length || rContents.candidates[kind].length))
      warnings.push({ scope:'combined', code:'empty-intersection', kind, message:`${kind}の統合候補は空です。全素材への置き換えは行いません。` });
  }
  if (dungeon && room && !resolveRoomThemeSelection(dungeon.roomThemeSelection,[room]).candidates.length)
    warnings.push({ scope:'combined', code:'room-theme-excluded', id:room.id, message:'このRoom ThemeはDungeon Themeの候補に含まれていません。手動適用は可能です。' });
  const byId = new Map(contents.map(c => [c.id,c]));
  const requiredContents: ResolvedRequiredContent[] = (room?.requiredContents ?? []).map(value => {
    const entry = normalizeRequiredEntry(value), content = byId.get(entry.contentId);
    const status = !content ? 'missing' : content.kind !== entry.expectedKind ? 'kind-mismatch' : 'resolved';
    const conflict = status === 'resolved' && !contentCandidates[entry.expectedKind].some(c => c.id === entry.contentId);
    if (status !== 'resolved' || conflict) warnings.push({ scope:'required', code:status === 'resolved' ? 'required-conflict' : `required-${status}`,id:entry.id,kind:entry.expectedKind,
      message:status === 'missing' ? `必須素材「${entry.contentId}」が見つかりません。` : status === 'kind-mismatch' ? `必須素材「${entry.contentId}」の種別が一致しません。` : `必須素材「${content!.name}」は統合された任意候補に含まれません。` });
    return { entry, ...(content ? { content } : {}), status, conflict };
  });
  return { pieceCandidates, contentCandidates, requiredContents, warnings };
}
export function diagnosePlacedRoom(room: PlacedRoom, dungeonTheme?: DungeonPolicy) {
  const theme = room.roomTheme?.themeSnapshot;
  if (!theme) return [];
  const warnings: RoomThemeWarning[] = [], geometry = evaluateRoomPiece(room.piece, theme.pieceConstraints, room.rotation);
  if (!geometry.matches) warnings.push({ scope:'structure',code:'placed-constraints',id:room.id,message:`現在の回転${room.rotation}°のPieceが構造条件を満たしません。${geometry.reasons.join(' / ')}` });
  if (!resolvePieceSelection(theme.pieceSelection,[room.piece]).candidates.length || (dungeonTheme && !resolvePieceSelection(dungeonTheme.pieceSelection,[room.piece]).candidates.length))
    warnings.push({ scope:'room',code:'placed-piece-excluded',id:room.id,message:'配置済みPieceはテーマの素材候補に含まれていません。配置は維持します。' });
  return warnings;
}
