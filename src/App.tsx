import { lazy, Suspense } from 'react';
import { Editor } from './components/editor/Editor';
import { MarkdownEditorWindow } from './components/markdown/MarkdownEditorWindow';
import { PieceEditorWindow } from './components/pieceEditor/PieceEditorWindow';

const PublishingWindow = lazy(() => import('./components/publishing/PublishingWindow').then(m => ({ default: m.PublishingWindow })));

function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('publishing') === '1') return <Suspense fallback={<p>出版画面を準備しています…</p>}><PublishingWindow /></Suspense>;
  const isMarkdownEditor = params.get('markdownEditor') === '1';
  return params.get('pieceEditor') === '1' ? <PieceEditorWindow /> : isMarkdownEditor ? <MarkdownEditorWindow /> : <Editor />;
}

export default App;
