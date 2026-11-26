import { checkPrintDocumentSize } from './printDocument';

export const PRINT_READY_TIMEOUT_MS = 15_000;
export const PRINT_SESSION_TIMEOUT_MS = 120_000;
type PrintWindow = Pick<Window, 'closed' | 'close' | 'focus' | 'print' | 'document' | 'addEventListener' | 'removeEventListener' | 'opener'>;
function waitReady(popup: PrintWindow) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('印刷文書の準備が完了しませんでした。')); }, PRINT_READY_TIMEOUT_MS);
    const ready = () => { cleanup(); resolve(); };
    const cleanup = () => { clearTimeout(timer); popup.removeEventListener('load', ready); };
    popup.addEventListener('load', ready);
    if (popup.document.readyState === 'complete') ready();
  });
}
/** Writes only app-generated, sanitized HTML. No executable script is embedded. */
export function createBrowserPrintAdapter(open: () => PrintWindow | null = () => window.open('', '_blank', 'popup=yes,width=1000,height=850')) {
  let active: PrintWindow | null = null, finish: (() => void) | undefined;
  const windows = new Set<PrintWindow>();
  return {
    get busy() { return active !== null; },
    get hasWindows() { return [...windows].some(popup => !popup.closed); },
    async print(html: string) {
      if (active) throw new Error('印刷画面を開いています。印刷またはキャンセルを完了してください。');
      checkPrintDocumentSize(html);
      const popup = open();
      if (!popup || (typeof window !== 'undefined' && popup === window)) throw new Error('印刷画面を開けませんでした。ポップアップを許可してください。');
      active = popup;
      windows.add(popup);
      let timedOut = false;
      try {
        popup.document.open(); popup.document.write(html); popup.document.close();
        popup.opener = null;
        await waitReady(popup);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('フォントの準備が完了しませんでした。')), PRINT_READY_TIMEOUT_MS);
          Promise.resolve(popup.document.fonts?.ready).then(() => { clearTimeout(timer); resolve(); }, e => { clearTimeout(timer); reject(e); });
        });
        if (popup.closed) return;
        await new Promise<void>((resolve, reject) => {
          let completed = false;
          const cleanup = () => {
            if (completed) return;
            completed = true; clearTimeout(timeout); clearInterval(poll);
            popup.removeEventListener('afterprint', done); popup.removeEventListener('pagehide', done);
            finish = undefined;
          };
          const done = () => { cleanup(); resolve(); };
          const timeout = setTimeout(() => { timedOut = true; done(); }, PRINT_SESSION_TIMEOUT_MS);
          const poll = setInterval(() => { if (popup.closed) done(); }, 500);
          finish = done;
          popup.addEventListener('afterprint', done); popup.addEventListener('pagehide', done);
          try { popup.focus(); popup.print(); }
          catch (error) { cleanup(); reject(error); }
        });
      } finally {
        if (!popup.closed && !timedOut) popup.close();
        if (popup.closed) windows.delete(popup);
        if (active === popup) active = null;
      }
    },
    close() { for (const popup of windows) if (!popup.closed) popup.close(); windows.clear(); finish?.(); active = null; },
  };
}
