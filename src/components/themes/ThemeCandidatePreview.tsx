import { useMemo, useState } from 'react';
import { CONTENT_KINDS, CONTENT_LABELS } from '../../model/content';
import type { ContentDefinition, ContentKind } from '../../model/content';
import type { Piece } from '../../model/types';
import type { ContentSelectionPolicy, PieceSelectionPolicy } from '../../model/themeSelection';
import { resolvePieceSelection, resolveContentSelection } from '../../model/themeSelection';

export function ThemeCandidatePreview({ pieceSelection, contentSelection, pieces, contents }: {
  pieceSelection: PieceSelectionPolicy; contentSelection: ContentSelectionPolicy; pieces: readonly Piece[]; contents: readonly ContentDefinition[];
}) {
  const result = useMemo(() => ({ piece: resolvePieceSelection(pieceSelection, pieces), content: resolveContentSelection(contentSelection, contents) }), [pieceSelection, contentSelection, pieces, contents]);
  const [kind, setKind] = useState<'piece' | ContentKind>('piece'), [page, setPage] = useState(0);
  const values = kind === 'piece' ? result.piece.candidates : result.content.candidates[kind];
  const actualPage = Math.min(page, Math.max(0, Math.ceil(values.length / 50) - 1));
  const warnings = [...result.piece.warnings, ...result.content.warnings];
  return <section aria-label="テーマ候補プレビュー">
    <h2>候補プレビュー</h2><p>現在のライブラリから解決します。素材そのものはテーマへ保存しません。</p>
    <nav><button aria-pressed={kind === 'piece'} onClick={() => { setKind('piece'); setPage(0); }}>Piece ({result.piece.candidates.length})</button>
      {CONTENT_KINDS.map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setPage(0); }}>{CONTENT_LABELS[k]} ({result.content.candidates[k].length})</button>)}</nav>
    <p>候補 {values.length}件 / 警告 {warnings.length}件</p>
    <div className="theme-candidates">{values.slice(actualPage * 50, (actualPage + 1) * 50).map(v => <article key={v.id}><strong>{v.name}</strong>
      <p>{'kind' in v ? CONTENT_LABELS[v.kind] : v.shape} / {(v.tags ?? []).join(', ')}</p>{'summary' in v && <p>{v.summary}</p>}<small>{v.id}</small></article>)}</div>
    <button disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>前の候補</button><button disabled={(actualPage + 1) * 50 >= values.length} onClick={() => setPage(actualPage + 1)}>次の候補</button>
    {warnings.length > 0 && <div aria-label="テーマ選択の警告"><p>警告は保存を妨げません。参照IDや条件を確認してください。</p><ul>{warnings.slice(0, 100).map((w, i) => <li key={i}>{w.kind ? `${CONTENT_LABELS[w.kind]}: ` : 'Piece: '}{w.message}</li>)}</ul>{warnings.length > 100 && <p>先頭100件を表示しています。</p>}</div>}
  </section>;
}
