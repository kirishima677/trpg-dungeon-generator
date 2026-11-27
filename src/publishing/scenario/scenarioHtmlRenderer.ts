import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';
import type { ScenarioGuide, ScenarioGuideRoom } from './scenarioGuide';
import { MAX_GUIDE_HTML_BYTES } from './scenarioGuide';
import { scenarioStyles } from './scenarioStyles';
import { CONTENT_LABELS } from '../../model/content';

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const heading = (room: ScenarioGuideRoom) => [room.number, room.name].filter((value): value is string => Boolean(value)).map(escapeHtml).join('. ');

function renderEntities(room: ScenarioGuideRoom, markdown: (value: string) => string, gm: boolean) {
  if (!gm) return (room.entityDescriptions ?? []).map(description => markdown(description)).join('');
  return (room.entities ?? []).map(group => `<section><h4>${CONTENT_LABELS[group.kind]}</h4>${group.entries.map(entity => `<section><h5>${escapeHtml(entity.name)} × ${entity.quantity}</h5>
<p>元の素材: ${escapeHtml(entity.sourceName)}</p>${entity.summary ? `<p>${escapeHtml(entity.summary)}</p>` : ''}
${entity.description ? `<section><h6>素材の公開説明</h6>${markdown(entity.description)}</section>` : ''}
${entity.tags.length ? `<p class="tags">タグ: ${entity.tags.map(escapeHtml).join(', ')}</p>` : ''}
${Object.keys(entity.attributes).length ? `<table><thead><tr><th>属性</th><th>値</th></tr></thead><tbody>${Object.entries(entity.attributes).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value))}</td></tr>`).join('')}</tbody></table>` : ''}
${entity.definitionGmNotes ? `<section class="gm-notes"><h6>素材のGM情報</h6>${markdown(entity.definitionGmNotes)}</section>` : ''}
${entity.publicDescription ? `<section><h6>配置固有の公開説明</h6>${markdown(entity.publicDescription)}</section>` : ''}
${entity.gmNotes ? `<section class="gm-notes"><h6>配置固有のGM情報</h6>${markdown(entity.gmNotes)}</section>` : ''}</section>`).join('')}</section>`).join('');
}

/** The renderer sees only previously filtered content. mapSvg comes from our SVG renderer. */
export function renderScenarioHtml(guide: ScenarioGuide, markdown: (value: string) => string = value => renderMarkdownToHtml(value, true)): string {
  const toc = guide.includeTableOfContents ? `<nav aria-label="目次"><h2>目次</h2><ul>
${guide.scenarioMarkdown ? '<li><a href="#guide-overview">ダンジョン概要</a></li>' : ''}
${guide.mapSvg ? '<li><a href="#guide-map">ダンジョンマップ</a></li>' : ''}
<li><a href="#guide-rooms">部屋ガイド</a><ul>${guide.rooms.map(room => `<li><a href="#${room.anchorId}">${heading(room)}</a></li>`).join('')}</ul></li></ul></nav>` : '';
  const overview = guide.scenarioMarkdown ? `<section id="guide-overview"><h2>ダンジョン概要</h2>${markdown(guide.scenarioMarkdown)}</section>` : '';
  const map = guide.mapSvg ? `<section id="guide-map"><h2>ダンジョンマップ</h2><div class="map-container">${guide.mapSvg}</div></section>` : '';
  const rooms = guide.rooms.map(room => `<article id="${room.anchorId}" class="room-guide${!room.entities?.length && !room.entityDescriptions?.length && [room.description, room.gmNotes, ...(room.tags ?? [])].join('').length <= 800 ? ' room-guide--short' : ''}"><h3>${heading(room)}</h3>
${room.description ? `<section><h4>公開説明</h4>${markdown(room.description)}</section>` : ''}
${room.gmNotes ? `<section class="gm-notes"><h4>GM専用情報</h4>${markdown(room.gmNotes)}</section>` : ''}
${room.tags?.length ? `<p class="tags"><strong>タグ:</strong> ${room.tags.map(escapeHtml).join(', ')}</p>` : ''}${renderEntities(room, markdown, guide.audience === 'gm')}</article>`).join('');
  const label = guide.audience === 'gm' ? 'GM用シナリオガイド' : 'プレイヤー用シナリオガイド';
  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(guide.title)} - ${label}</title><style>${scenarioStyles}</style></head>
<body><header><h1>${escapeHtml(guide.title)}</h1><p>${label}</p></header>${toc}<main>${overview}${map}
<section id="guide-rooms"><h2>部屋ガイド</h2>${rooms || '<p>部屋がありません。</p>'}</section></main></body></html>`;
  if (new TextEncoder().encode(html).byteLength > MAX_GUIDE_HTML_BYTES) throw new Error('HTMLが8MiBを超えています。マップや説明の出力設定を減らしてください。');
  return html;
}

/** One renderer per fixed snapshot; setting changes reuse sanitized Markdown. */
export function createScenarioHtmlRenderer() {
  const cache = new Map<string, string>();
  return (guide: ScenarioGuide) => renderScenarioHtml(guide, value => {
    if (!cache.has(value)) cache.set(value, renderMarkdownToHtml(value, true));
    return cache.get(value)!;
  });
}
