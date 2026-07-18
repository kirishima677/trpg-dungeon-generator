let markdownWindowRef: Window | null = null;

const WINDOW_FEATURES = 'popup=yes,width=1000,height=750';

export function openMarkdownEditorWindow(dungeonId: string): void {
  if (markdownWindowRef && !markdownWindowRef.closed) {
    markdownWindowRef.focus();
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('markdownEditor', '1');
  url.searchParams.set('dungeonId', dungeonId);

  markdownWindowRef = window.open(url.toString(), 'markdown-editor-window', WINDOW_FEATURES);
  markdownWindowRef?.focus();
}
