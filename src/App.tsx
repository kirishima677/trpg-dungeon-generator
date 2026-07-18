import { Editor } from './components/editor/Editor';
import { MarkdownEditorWindow } from './components/markdown/MarkdownEditorWindow';

function App() {
  const params = new URLSearchParams(window.location.search);
  const isMarkdownEditor = params.get('markdownEditor') === '1';
  return isMarkdownEditor ? <MarkdownEditorWindow /> : <Editor />;
}

export default App;
