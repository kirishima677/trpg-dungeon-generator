import type { PackageArtifact, PackageArtifactRequest, PackagePlan, PackageProfile } from './packagePlan';
import { MAX_PACKAGE_FILES, MAX_PACKAGE_FILE_BYTES, MAX_PACKAGE_TOTAL_BYTES, MEDIA_TYPES, safePackagePath, validatePackagePlan } from './packagePlan';
import type { PieceInventoryItem } from '../pieceSheet/inventory';

export const utf8 = (text: string) => new TextEncoder().encode(text);
export function packageArtifact(request: PackageArtifactRequest, data: string | Uint8Array): PackageArtifact {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return { ...request, mediaType: MEDIA_TYPES[request.kind], data: bytes, sizeBytes: bytes.byteLength };
}
export function validatePackageArtifacts(plan: PackagePlan, files: readonly PackageArtifact[], finalized = true) {
  validatePackagePlan(plan);
  if (files.length > MAX_PACKAGE_FILES) throw new Error('収録ファイル数の上限を超えています。');
  const expected = new Map(plan.artifacts.map(r => [r.path, r])), seen = new Set<string>(); let total = 0;
  for (const f of files) {
    const key = safePackagePath(f.path), r = expected.get(f.path);
    if (seen.has(key)) throw new Error('収録ファイルのパスが重複しています。'); seen.add(key);
    if (!r || f.kind !== r.kind || f.audience !== r.audience || f.id !== r.id || f.mediaType !== MEDIA_TYPES[r.kind]
      || f.pieceId !== r.pieceId || (plan.kind === 'player' && (f.audience === 'gm' || f.audience === 'project'))) throw new Error('収録計画と成果物の公開範囲・形式が一致しません。');
    if (!(f.data instanceof Uint8Array) || f.sizeBytes !== f.data.byteLength || !f.sizeBytes || f.sizeBytes > MAX_PACKAGE_FILE_BYTES) throw new Error(`${f.path}: 空ファイル・サイズ不一致、または1ファイル32MiBの上限超過です。`);
    total += f.sizeBytes;
    if (total > MAX_PACKAGE_TOTAL_BYTES) throw new Error('圧縮前の総データが96MiBを超えています。');
    if (f.kind === 'map-png' && (f.data.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => f.data[i] === v))) throw new Error(`${f.path}: PNG形式が不正です。`);
    const text = f.kind === 'map-png' ? '' : new TextDecoder().decode(f.data);
    if (f.kind === 'map-svg' && !text.startsWith('<svg')) throw new Error(`${f.path}: SVG形式が不正です。`);
    if (f.mediaType === 'text/html' && !text.startsWith('<!DOCTYPE html>')) throw new Error(`${f.path}: HTML形式が不正です。`);
    if (f.mediaType === 'application/json') { try { JSON.parse(text); } catch { throw new Error(`${f.path}: JSON形式が不正です。`); } }
  }
  if (finalized && (files.length !== plan.artifacts.length || plan.artifacts.some(r => !files.some(f => f.path === r.path)))) throw new Error('選択した成果物が不足しています。パッケージ生成を中止しました。');
  return total;
}
const csvField = (value: string) => {
  // Spreadsheet applications may interpret leading whitespace/control characters before a formula.
  let start = 0;
  while (start < value.length && (value.charCodeAt(start) <= 32 || /\s/u.test(value[start]))) start++;
  const safe = /^[=+\-@]/u.test(value.slice(start)) || [9, 10, 13].includes(value.charCodeAt(0)) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
export function inventoryCsv(items: readonly PieceInventoryItem[], audience: 'player' | 'gm') {
  return '\uFEFFpiece_id,name,category,required_quantity,print_quantity\r\n' + items.map(i => [
    audience === 'player' ? i.code : i.pieceId ?? i.code, audience === 'player' && i.source === 'piece-library' ? i.code : i.name,
    i.category, String(i.requiredQuantity), String(i.printQuantity),
  ].map(csvField).join(',')).join('\r\n') + '\r\n';
}
export function packageReadme(profile: PackageProfile, files: readonly PackageArtifact[], warnings: readonly string[]) {
  const list = files.map(f => `${f.path} — ${f.audience} — ${f.mediaType}`).join('\n');
  const has = (kind: PackageArtifact['kind']) => files.some(f => f.kind === kind);
  return `${profile.title.trim()}\n${profile.kind.toUpperCase()} Package\n\n${profile.kind !== 'player' ? 'GM専用情報・制作データを含む可能性があります。パッケージ全体をプレイヤーへ配布しないでください。\n\n' : ''}収録内容\n${list}\nmanifest.json — 収録ファイル一覧\n`
    + (files.some(f => f.mediaType === 'text/html') ? '\nHTMLは展開してブラウザで開けます。アプリやインターネット接続は不要です。\n' : '')
    + (files.some(f => f.path.includes('/print/') || f.path.startsWith('print/')) ? '\n印刷用HTMLはブラウザで開き、印刷またはPDF保存してください。実寸は倍率100%、自動縮小なし、指定の用紙を選び、ヘッダー・フッターを無効にしてください。印刷後に確認用目盛りを測定してください。PDFはZIPに含めていません。\n' : '')
    + (has('piece-inventory') ? '\nCSVはUTF-8です。必要数量と印刷数量を区別しています。\n' : '')
    + (has('project-json') ? '\n復元: ZIPを展開し、project/dungeon.jsonを編集画面の既存「インポート」から読み込んでください。ユーザー定義ピースはJSON内にも含まれます。\n' : '')
    + (warnings.length ? `\n確認済みの警告\n${warnings.join('\n')}\n` : '');
}
export function packageManifest(profile: PackageProfile, files: readonly PackageArtifact[], createdAt: string, warnings: readonly string[]) {
  return JSON.stringify({ schemaVersion: '1.0.0', packageType: profile.kind, title: profile.title.trim(), createdAt,
    files: files.map(({ path, mediaType, audience, sizeBytes }) => ({ path, mediaType, audience, sizeBytes })),
    ...(warnings.length ? { warnings: [...warnings] } : {}) }, null, 2);
}
export function validateManifest(files: readonly PackageArtifact[]) {
  const manifest = files.find(f => f.kind === 'manifest');
  if (!manifest) throw new Error('manifest.jsonがありません。');
  const value = JSON.parse(new TextDecoder().decode(manifest.data));
  const entries = files.filter(f => f.kind !== 'manifest').map(({ path, mediaType, audience, sizeBytes }) => ({ path, mediaType, audience, sizeBytes }));
  if (JSON.stringify(value.files) !== JSON.stringify(entries)) throw new Error('マニフェストと実際の収録ファイルが一致しません。');
}
