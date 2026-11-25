import { Editor } from './components/editor/Editor';
import { MarkdownEditorWindow } from './components/markdown/MarkdownEditorWindow';
import { PieceEditorWindow } from './components/pieceEditor/PieceEditorWindow';

function App() {
  const params = new URLSearchParams(window.location.search);
  const isMarkdownEditor = params.get('markdownEditor') === '1';
  return params.get('pieceEditor') === '1' ? <PieceEditorWindow /> : isMarkdownEditor ? <MarkdownEditorWindow /> : <Editor />;
}

export default App;
