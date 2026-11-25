export const scenarioStyles = `
html { color-scheme: light; background: #e2e8f0; }
body { max-width: 960px; margin: 24px auto; padding: 32px; background: white; color: #172033;
  font: 16px/1.8 system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif; overflow-wrap: anywhere; }
* { box-sizing: border-box; }
h1, h2, h3, h4, h5, h6 { line-height: 1.4; break-after: avoid; }
h1 { font-size: 2em; } h2 { margin-top: 2em; border-bottom: 2px solid #cbd5e1; padding-bottom: .3em; }
h3 { font-size: 1.25em; } p, ul, ol, blockquote, pre, table { margin: 1em 0; }
a { color: #1d4ed8; text-decoration: underline; }
nav { border: 1px solid #cbd5e1; padding: 0 20px 12px; border-radius: 8px; }
nav ul { margin: .4em 0; }
table { border-collapse: collapse; max-width: 100%; } th, td { border: 1px solid #94a3b8; padding: .4em .7em; }
thead { background: #f1f5f9; } tr { break-inside: avoid; }
blockquote { margin-left: 0; border-left: 4px solid #94a3b8; padding-left: 1em; color: #475569; }
pre { padding: 14px; border: 1px solid #cbd5e1; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
code { font-family: ui-monospace, monospace; background: #f1f5f9; }
.map-container { width: 100%; break-inside: avoid; } .map-container svg { display: block; width: 100%; height: auto; max-width: 100%; }
.room-guide { border-top: 1px solid #cbd5e1; margin-top: 2em; padding-top: .5em; }
.gm-notes { background: #fef3c7; border-left: 4px solid #b45309; padding: 1px 16px; margin: 1em 0; }
.tags { border: 1px solid #cbd5e1; padding: .5em 1em; break-inside: avoid; }
@media (max-width: 640px) { body { margin: 0; padding: 16px; font-size: 15px; } }
@media print {
  html, body { background: white; color: black; }
  body { max-width: none; margin: 0; padding: 0; font-size: 11pt; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  .map-container, .tags, tr { break-inside: avoid; page-break-inside: avoid; }
  .room-guide, .gm-notes, pre, table { break-inside: auto; }
  a { color: black; } .gm-notes { border: 1px solid black; border-left-width: 4px; background: white; }
}`;
