import type { DungeonDocument, Piece } from '../../model/types';
import { isStandardPiece, normalizePiece, pieceStructure } from '../../editor/pieces/pieceDefinition';
import { exportFilename } from '../exporters';

export type PackageKind = 'player' | 'gm' | 'complete';
export type ArtifactAudience = 'player' | 'gm' | 'project' | 'package';
export const ARTIFACT_LABELS = {
  'map-svg': 'SVGマップ', 'map-png': 'PNGマップ', 'scenario-guide': 'HTMLシナリオガイド',
  'scenario-print': 'シナリオ印刷文書', 'reference-map-print': '参照用マップ印刷', 'battle-map-print': '卓上用マップ印刷',
  'piece-sheets': 'ピース印刷シート', 'piece-inventory': 'ピース必要数量CSV', 'project-json': 'プロジェクトJSON',
  'piece-library-json': '使用ユーザー定義ピースJSON',
} as const;
export type PackageArtifactKind = keyof typeof ARTIFACT_LABELS;
export type ArtifactKind = PackageArtifactKind | 'readme' | 'manifest';
export interface PackageProfile { kind: PackageKind; title: string; artifacts: PackageArtifactKind[]; includePlayerArtifacts: boolean; includeReadme: boolean }
export interface PackageArtifactRequest { id: string; kind: ArtifactKind; audience: ArtifactAudience; path: string; required: boolean; pieceId?: string }
export interface PackagePlan { kind: PackageKind; artifacts: PackageArtifactRequest[] }
export interface PackageArtifact extends PackageArtifactRequest { mediaType: string; data: Uint8Array; sizeBytes: number }
export const MAX_PACKAGE_FILES = 64;
export const MAX_PACKAGE_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PACKAGE_TOTAL_BYTES = 96 * 1024 * 1024;
export const MAX_PACKAGE_ZIP_BYTES = 100 * 1024 * 1024;
export const MAX_PACKAGE_PNG_PIXELS = 33_554_432;
export const MAX_PACKAGE_PRINT_PAGES = 200;
export const MEDIA_TYPES = { 'map-svg': 'image/svg+xml', 'map-png': 'image/png', 'scenario-guide': 'text/html',
  'scenario-print': 'text/html', 'reference-map-print': 'text/html', 'battle-map-print': 'text/html', 'piece-sheets': 'text/html',
  'piece-inventory': 'text/csv', 'project-json': 'application/json', 'piece-library-json': 'application/json',
  readme: 'text/plain', manifest: 'application/json' } as const;
const paths: Record<Exclude<ArtifactKind, 'piece-library-json'>, string> = {
  'map-svg': 'maps/map.svg', 'map-png': 'maps/map.png', 'scenario-guide': 'guide/scenario-guide.html',
  'scenario-print': 'print/scenario-guide.html', 'reference-map-print': 'print/reference-map.html',
  'battle-map-print': 'print/battle-map.html', 'piece-sheets': 'print/piece-sheets.html',
  'piece-inventory': 'print/piece-inventory.csv', 'project-json': 'project/dungeon.json', readme: 'README.txt', manifest: 'manifest.json',
};
const hasControls = (value: string) => [...value].some(c => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127);
export function defaultPackageProfile(kind: PackageKind = 'player'): PackageProfile {
  const artifacts: PackageArtifactKind[] = kind === 'complete' ? Object.keys(ARTIFACT_LABELS).filter(k => k !== 'piece-library-json') as PackageArtifactKind[]
    : kind === 'gm' ? ['map-svg', 'map-png', 'scenario-guide', 'scenario-print', 'piece-inventory'] : ['map-svg', 'map-png', 'scenario-guide'];
  return { kind, title: 'ダンジョン出版物', artifacts, includePlayerArtifacts: kind === 'complete', includeReadme: true };
}
export function validatePackageProfile(p: PackageProfile) {
  if (!p || !['player', 'gm', 'complete'].includes(p.kind) || typeof p.title !== 'string' || !p.title.trim()
    || p.title.length > 200 || hasControls(p.title) || !Array.isArray(p.artifacts) || !p.artifacts.length
    || new Set(p.artifacts).size !== p.artifacts.length || p.artifacts.some(k => !Object.hasOwn(ARTIFACT_LABELS, k))
    || typeof p.includePlayerArtifacts !== 'boolean' || typeof p.includeReadme !== 'boolean') throw new Error('パッケージ設定・公開タイトル・収録内容が不正です。');
  if (p.kind === 'player' && (p.includePlayerArtifacts || p.artifacts.some(k => k === 'project-json' || k === 'piece-library-json'))) throw new Error('プレイヤー用にはGM用・制作データを収録できません。');
  if (p.kind === 'complete' && !p.artifacts.includes('project-json')) throw new Error('完全版にはプロジェクトJSONが必須です。');
}
export function referencedCustomPieces(source: DungeonDocument): Piece[] {
  const pieces = new Map<string, Piece>();
  for (const room of source.rooms) {
    if (room.pieceId !== room.piece?.id) throw new Error('参照ピースが不正です。');
    if (isStandardPiece(room.pieceId)) continue;
    const piece = normalizePiece(room.piece), previous = pieces.get(piece.id);
    if (previous && pieceStructure(previous) !== pieceStructure(piece)) throw new Error('同じPiece IDに異なる定義があります。');
    if (!previous) pieces.set(piece.id, piece);
  }
  return [...pieces.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Fixed paths never interpolate names or source IDs. */
export function buildPackagePlan(profile: PackageProfile, source: DungeonDocument): PackagePlan {
  validatePackageProfile(profile);
  const artifacts: PackageArtifactRequest[] = [];
  const append = (kind: ArtifactKind, audience: ArtifactAudience, path: string, pieceId?: string) => artifacts.push({ id: path, kind, audience, path, required: true, ...(pieceId ? { pieceId } : {}) });
  for (const kind of Object.keys(ARTIFACT_LABELS) as PackageArtifactKind[]) {
    if (!profile.artifacts.includes(kind)) continue;
    if (kind === 'project-json') append(kind, 'project', paths[kind]);
    else if (kind === 'piece-library-json') referencedCustomPieces(source).forEach((p, i) => append(kind, 'project', `project/pieces/custom-piece-${String(i + 1).padStart(4, '0')}.json`, p.id));
    else {
      const audiences = profile.kind === 'player' ? ['player'] as const : profile.includePlayerArtifacts ? ['gm', 'player'] as const : ['gm'] as const;
      for (const audience of audiences) append(kind, audience, `${profile.kind === 'player' ? '' : `${audience}/`}${paths[kind]}`);
    }
  }
  if (profile.includeReadme) append('readme', 'package', paths.readme);
  append('manifest', 'package', paths.manifest);
  const plan = { kind: profile.kind, artifacts }; validatePackagePlan(plan); return plan;
}
export function safePackagePath(path: string) {
  if (typeof path !== 'string' || !path || path.length > 240 || path.startsWith('/') || /[\\:<>"|?*]/u.test(path) || hasControls(path)
    || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('ZIP内のパスが安全な相対パスではありません。');
  return path.normalize('NFC').toLowerCase();
}
export function validatePackagePlan(plan: PackagePlan) {
  if (!plan || !['player', 'gm', 'complete'].includes(plan.kind) || !Array.isArray(plan.artifacts) || !plan.artifacts.length
    || plan.artifacts.length > MAX_PACKAGE_FILES) throw new Error(`収録ファイルは${MAX_PACKAGE_FILES}個までです。`);
  const seen = new Set<string>();
  for (const r of plan.artifacts) {
    const key = safePackagePath(r.path);
    if (seen.has(key)) throw new Error('収録ファイルのパスが重複しています。'); seen.add(key);
    if (!Object.hasOwn(MEDIA_TYPES, r.kind) || r.id !== r.path || r.required !== true
      || !['player', 'gm', 'project', 'package'].includes(r.audience)) throw new Error('収録計画の形式が不正です。');
    if (plan.kind === 'player' && (r.audience === 'gm' || r.audience === 'project')) throw new Error('プレイヤー用への非公開成果物の収録を拒否しました。');
    const audience = r.kind === 'manifest' || r.kind === 'readme' ? 'package' : r.kind === 'project-json' || r.kind === 'piece-library-json' ? 'project' : r.audience;
    if (r.kind !== 'manifest' && r.kind !== 'readme' && r.kind !== 'project-json' && r.kind !== 'piece-library-json'
      && (audience !== 'player' && audience !== 'gm')) throw new Error('出版成果物の公開範囲が不正です。');
    const path = r.kind === 'piece-library-json' ? /^project\/pieces\/custom-piece-\d{4}\.json$/.test(r.path) && r.pieceId ? r.path : ''
      : `${audience === 'package' || audience === 'project' || plan.kind === 'player' ? '' : `${audience}/`}${paths[r.kind]}`;
    if (r.audience !== audience || r.path !== path || (audience !== 'project' && audience !== 'package' && audience !== 'player' && audience !== 'gm')) throw new Error('収録形式・公開範囲・パスが一致しません。');
  }
  if (!plan.artifacts.some(r => r.kind === 'manifest') || (plan.kind === 'complete' && !plan.artifacts.some(r => r.kind === 'project-json'))) throw new Error('必須成果物がありません。');
}
export function packageFilename(profile: PackageProfile) {
  validatePackageProfile(profile);
  const name = exportFilename(profile.title, 'player', 'svg').replace(/-player\.svg$/, '');
  // Windows device names remain unsafe even after ordinary filename normalization.
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) ? `dungeon-${name}` : name;
  return `${safe}-${profile.kind}.zip`;
}
