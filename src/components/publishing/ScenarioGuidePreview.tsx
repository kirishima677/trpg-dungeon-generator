import { useMemo } from 'react';
import { scenarioPreviewHtml } from '../../publishing/scenario/scenarioPreviewHtml';

export function ScenarioGuidePreview({ html }: { html: string }) {
  const preview = useMemo(() => scenarioPreviewHtml(html), [html]);
  return <section className="publish-guide-preview" aria-label="シナリオガイドプレビュー">
    <iframe title="シナリオガイド文書" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} />
  </section>;
}
