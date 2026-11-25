import { openEditorWindow } from '../editorWindows';

const WINDOW_FEATURES = 'popup=yes,width=1000,height=750';

export function openMarkdownEditorWindow(dungeonId: string): void {
  openEditorWindow('markdown-editor-window', { markdownEditor: '1', dungeonId }, WINDOW_FEATURES);
}
