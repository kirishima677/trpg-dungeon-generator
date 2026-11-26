import { ScenarioGuidePreview } from './ScenarioGuidePreview';
import type { PrintLayout } from '../../publishing/print/printLayout';

export function PrintPreview({ html, layout, pageIndex, onPageChange }: { html: string; layout: PrintLayout | null; pageIndex: number; onPageChange: (index: number) => void }) {
  return <section className="publish-print-preview" aria-label="印刷プレビュー">
    {layout ? <><p>マップ寸法: {layout.mapWidthMm.toFixed(2)} × {layout.mapHeightMm.toFixed(2)} mm<br />
      1マス: {layout.cellSizeMm.toFixed(3)} mm / 重複: {layout.overlapMm} mm<br />
      用紙: {layout.paperWidthMm} × {layout.paperHeightMm} mm / 全{layout.pages.length}枚（{layout.columns}列 × {layout.rows}行）</p>
      <nav className="print-page-list" aria-label="分割ページ">{layout.pages.map(page => <button key={page.index} aria-pressed={pageIndex === page.index}
        onClick={() => onPageChange(page.index)}>{page.label}</button>)}</nav>
      <p className="publish-help">選択した1ページを表示します。印刷時はすべてのページを同じ縮尺で出力します。</p></>
      : html ? <p className="publish-help">文書の最終的なページ数と改ページ位置はブラウザの印刷プレビューで確認してください。</p> : null}
    {html && <ScenarioGuidePreview html={html} />}
  </section>;
}
