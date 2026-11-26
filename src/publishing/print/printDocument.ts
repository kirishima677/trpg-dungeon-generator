import type { PublishAudience } from '../publishProfile';
import type { PrintLayout, PrintPage } from './printLayout';
import { printAreas, svgToMm } from './printLayout';
import type { PrintProfile } from './printProfile';
import { MAX_PRINT_DOCUMENT_BYTES } from './printProfile';

export const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const number = (n: number) => Number(n.toFixed(8));
const mm = (n: number) => `${number(n)}mm`;
export function printDocumentStyles(profile: PrintProfile) {
  const area = printAreas(profile), m = profile.marginsMm;
  return `
@page { size: ${mm(area.paperWidthMm)} ${mm(area.paperHeightMm)}; margin: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)}; }
html { color-scheme: light; background: #e2e8f0; }
body { margin: 0; color: #172033; font-family: system-ui, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; }
.print-ui { padding: 16px; max-width: 960px; margin: auto; font-size: 14px; }
.print-source { position: absolute; width: 0; height: 0; overflow: hidden; }
.print-sheet { box-sizing: border-box; position: relative; background: white; margin: 16px auto;
  width: ${mm(area.paperWidthMm)}; height: ${mm(area.paperHeightMm)}; padding: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)};
  box-shadow: 0 1px 5px #64748b; }
.print-page { position: relative; width: ${mm(area.printableWidthMm)}; height: ${mm(area.printableHeightMm)}; }
.print-page-label { position: absolute; left: 0; top: 0; width: 100%; height: 10mm; margin: 0; font-size: 9pt; line-height: 4mm; overflow: hidden; }
.print-page-label span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.print-map { position: absolute; display: block; overflow: hidden; }
.print-cut-marks { position: absolute; inset: 0; pointer-events: none; }
.print-scale { position: absolute; bottom: 0; left: 0; height: 8mm; max-width: 100%; overflow: hidden; font-size: 8pt; line-height: 3mm; white-space: nowrap; }
.print-scale svg { display: block; height: 3mm; }
@media screen { .print-sheet { zoom: ${number(Math.min(1, 100 / area.paperWidthMm))}; } }
@media print {
 html, body { background: white; margin: 0; padding: 0; }
 .print-ui { display: none; }
 .print-sheet { zoom: 1; width: ${mm(area.printableWidthMm)}; height: ${mm(area.printableHeightMm)}; margin: 0; padding: 0;
   box-shadow: none; break-inside: avoid; break-after: page; page-break-after: always; }
 .print-sheet:last-child { break-after: auto; page-break-after: auto; }
 .print-page { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;
}
export const BATTLE_PRINT_INSTRUCTIONS = '実寸で印刷する場合は、倍率を100%に設定し、「用紙に合わせる」等の自動縮小を無効にしてください。指定の用紙サイズを選び、必要に応じてブラウザのヘッダー・フッターを無効にしてください。印刷後に確認用目盛りを測定してください。';

/** One shared vector definition keeps page count from multiplying SVG memory. */
export function sharedMapDefinition(svg: string) {
  const match = /^<svg\b[^>]*>([\s\S]*)<\/svg>$/.exec(svg);
  if (!match) throw new Error('印刷元のSVGが不正です。');
  const inner = match[1].replace(/\bid="([a-zA-Z_][\w:.-]*)"/g, 'id="print-source-$1"')
    .replace(/\b(href|xlink:href)="#([a-zA-Z_][\w:.-]*)"/g, '$1="#print-source-$2"')
    .replace(/url\(#([a-zA-Z_][\w:.-]*)\)/g, 'url(#print-source-$1)');
  return `<svg class="print-source" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><g id="print-map-art" font-family="sans-serif">${inner}</g></defs></svg>`;
}

export function cutMarkSegments(page: PrintPage, layout: PrintLayout) {
  const b = page.contentBoundsMm, right = b.x + b.width, bottom = b.y + b.height;
  const cutRight = b.x + svgToMm(page.cutBounds.width, layout.cellSizeMm), cutBottom = b.y + svgToMm(page.cutBounds.height, layout.cellSizeMm);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const x of [b.x, cutRight]) for (const [y1, y2] of [[b.y - 3, b.y - 1], [bottom + 1, bottom + 3]]) lines.push({ x1: x, x2: x, y1, y2 });
  for (const y of [b.y, cutBottom]) for (const [x1, x2] of [[b.x - 3, b.x - 1], [right + 1, right + 3]]) lines.push({ x1, x2, y1: y, y2: y });
  return lines;
}
function renderPage(page: PrintPage, layout: PrintLayout, profile: PrintProfile, title: string, audience: PublishAudience) {
  const b = page.contentBoundsMm, s = page.sourceBounds, battle = profile.target === 'battle-map';
  const label = profile.showPageLabels ? `<p class="print-page-label"><span>${escapeHtml(title)}</span><span>${audience === 'gm' ? 'GM' : 'PLAYER'} MAP — ${page.label} — ${page.index + 1} / ${layout.pages.length}${battle ? ` — Grid: ${profile.map.cellSizeMm} mm` : ''}</span></p>` : '';
  const marks = battle && profile.map.showCutMarks ? `<svg class="print-cut-marks" xmlns="http://www.w3.org/2000/svg" width="${mm(layout.printableWidthMm)}" height="${mm(layout.printableHeightMm)}" viewBox="0 0 ${layout.printableWidthMm} ${layout.printableHeightMm}" fill="none" stroke="black" stroke-width="0.15">${cutMarkSegments(page, layout).map(l => `<line x1="${number(l.x1)}" y1="${number(l.y1)}" x2="${number(l.x2)}" y2="${number(l.y2)}"/>`).join('')}</svg>` : '';
  const scale = battle ? renderPrintScale(profile) : '';
  return `<section class="print-sheet" aria-label="Page ${page.label}"><div class="print-page">${label}
<svg class="print-map" xmlns="http://www.w3.org/2000/svg" x="0" y="0" width="${mm(b.width)}" height="${mm(b.height)}" viewBox="${s.x} ${s.y} ${s.width} ${s.height}" style="left:${mm(b.x)};top:${mm(b.y)}" preserveAspectRatio="xMinYMin meet" overflow="hidden"><use href="#print-map-art"/></svg>${marks}${scale}</div></section>`;
}
export function renderPrintScale(profile: PrintProfile) {
  return profile.map.showScaleBar ? `<div class="print-scale"><svg xmlns="http://www.w3.org/2000/svg" width="${mm(profile.map.cellSizeMm)}" height="3mm" viewBox="0 0 ${profile.map.cellSizeMm} 3"><path d="M 0 0 V 3 M 0 1.5 H ${profile.map.cellSizeMm} M ${profile.map.cellSizeMm} 0 V 3" fill="none" stroke="black" stroke-width="0.2"/></svg><span>1マス = ${profile.map.cellSizeMm} mm</span></div>` : '';
}
export function checkPrintDocumentSize(html: string) {
  if (new TextEncoder().encode(html).byteLength > MAX_PRINT_DOCUMENT_BYTES) throw new Error('印刷文書が16MiBを超えています。マップや文書の出力設定を減らしてください。');
  return html;
}
export function renderMapPrintDocument(svg: string, layout: PrintLayout, profile: PrintProfile, title: string,
  audience: PublishAudience, pageIndex?: number) {
  if (profile.target === 'scenario-guide') throw new Error('印刷対象がマップではありません。');
  const pages = pageIndex === undefined ? layout.pages : [layout.pages[pageIndex]];
  if (pages.some(p => !p)) throw new Error('表示するページがありません。');
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)} - ${audience === 'gm' ? 'GM' : 'PLAYER'} MAP</title><style>${printDocumentStyles(profile)}</style></head>
<body><div class="print-ui"><p>${profile.target === 'battle-map' ? BATTLE_PRINT_INSTRUCTIONS : '参照用マップです。用紙内に収めた縮尺を使用します。'}</p><p>${profile.paperSize} ${profile.orientation} / ${layout.columns}列 × ${layout.rows}行 / 全${layout.pages.length}ページ${pageIndex !== undefined ? ` / 表示: ${pages[0].label}` : ''}</p></div>
${sharedMapDefinition(svg)}<main>${pages.map(p => renderPage(p, layout, profile, title, audience)).join('')}</main></body></html>`;
  return checkPrintDocumentSize(html);
}
/** Extend the exact sanitized guide HTML instead of parsing Markdown again. */
export function renderScenarioPrintDocument(html: string, profile: PrintProfile) {
  if (profile.target !== 'scenario-guide') throw new Error('印刷対象がシナリオガイドではありません。');
  const area = printAreas(profile);
  const style = `
@page { size: ${mm(area.paperWidthMm)} ${mm(area.paperHeightMm)}; margin: ${mm(profile.marginsMm.top)} ${mm(profile.marginsMm.right)} ${mm(profile.marginsMm.bottom)} ${mm(profile.marginsMm.left)}; }
body { box-sizing: border-box; width: ${mm(area.printableWidthMm)}; max-width: none; margin: 16px auto; padding: 0; }
table { width: 100%; table-layout: fixed; } pre, code, th, td { overflow-wrap: anywhere; word-break: normal; }
.map-container svg { max-height: ${mm(Math.max(1, area.printableHeightMm - 30))}; }
@media print {
 body { width: auto; margin: 0; padding: 0; color: black; background: white; }
 h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
 .room-guide--short { break-inside: avoid; }
 .room-guide:not(.room-guide--short), .gm-notes, pre, table { break-inside: auto; }
 .map-container, tr, .tags { break-inside: avoid; }
}
`;
  if (!html.startsWith('<!DOCTYPE html>') || !html.includes('</style>')) throw new Error('シナリオ文書が不正です。');
  return checkPrintDocumentSize(html.replace('</style>', `${style}</style>`));
}
