import { lazy } from 'react';
import { WindowLoader } from './components/WindowLoader';

const Editor = lazy(() => import('./components/editor/Editor').then(m => ({ default: m.Editor })));
const MarkdownEditorWindow = lazy(() => import('./components/markdown/MarkdownEditorWindow').then(m => ({ default: m.MarkdownEditorWindow })));
const PieceEditorWindow = lazy(() => import('./components/pieceEditor/PieceEditorWindow').then(m => ({ default: m.PieceEditorWindow })));
const PublishingWindow = lazy(() => import('./components/publishing/PublishingWindow').then(m => ({ default: m.PublishingWindow })));

function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('publishing') === '1') return <WindowLoader name="出版画面"><PublishingWindow /></WindowLoader>;
  if (params.get('pieceEditor') === '1') return <WindowLoader name="ピースエディタ"><PieceEditorWindow /></WindowLoader>;
  if (params.get('markdownEditor') === '1') return <WindowLoader name="Markdownエディタ"><MarkdownEditorWindow /></WindowLoader>;
  return <WindowLoader name="ダンジョンエディタ"><Editor /></WindowLoader>;
}

export default App;
