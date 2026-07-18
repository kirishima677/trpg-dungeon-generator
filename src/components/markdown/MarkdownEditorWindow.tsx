import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dungeonRepository } from '../../repository/dungeonRepository';
import {
  MARKDOWN_CHANNEL_NAME,
  type MarkdownSavedEvent,
} from '../../editor/markdown/events';
import { renderMarkdownToHtml } from '../../editor/markdown/markdownRender';
import { MarkdownEasyMDE } from './MarkdownEasyMDE';
import './markdownEditorWindow.css';

type ViewMode = 'edit' | 'preview' | 'split';
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed';
const PRINT_WINDOW_CLOSE_TIMEOUT_MS = 60_000;
const PRINT_WINDOW_READY_TIMEOUT_MS = 5_000;

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case 'saved':
      return 'Saved';
    case 'saving':
      return 'Saving...';
    case 'unsaved':
      return 'Unsaved changes';
    case 'failed':
      return 'Save failed';
  }
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  const fallback = trimmed.length > 0 ? trimmed : 'dungeon';
  return fallback.replace(/[\\/:*?"<>|]/g, '_');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function normalizePrintLang(lang: string): string {
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) {
    return 'en';
  }

  try {
    const [canonical] = Intl.getCanonicalLocales(lang);
    if (canonical) {
      return canonical;
    }
  } catch {
    return 'en';
  }

  return lang;
}

function buildPrintDocumentHtml(title: string, bodyHtml: string, lang: string): string {
  const escapedTitle = escapeHtmlAttribute(title);
  const escapedLang = escapeHtmlAttribute(normalizePrintLang(lang));

  return `<!doctype html>
<html lang="${escapedLang}">
<head>
  <meta charset="utf-8" />
  <title>${escapedTitle}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    html, body { margin: 0; padding: 0; color: #111827; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif;
      line-height: 1.7;
      word-break: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid-page;
      page-break-after: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    pre, table {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function MarkdownEditorWindow() {
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [dungeonName, setDungeonName] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [savedMarkdown, setSavedMarkdown] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('edit');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const previewHtml = useMemo(() => renderMarkdownToHtml(markdown), [markdown]);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(MARKDOWN_CHANNEL_NAME);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('dungeonId');
    if (!id) {
      setLoadError('dungeonId is required');
      setLoading(false);
      return;
    }

    setDungeonId(id);

    void (async () => {
      try {
        const dungeon = await dungeonRepository.load(id);
        if (!dungeon) {
          setLoadError('Dungeon not found');
          return;
        }
        setDungeonName(dungeon.name);
        setMarkdown(dungeon.markdown);
        setSavedMarkdown(dungeon.markdown);
      } catch {
        setLoadError('Failed to load dungeon');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (markdown !== savedMarkdown && saveStatus !== 'saving') {
      setSaveStatus('unsaved');
    }
  }, [loading, markdown, savedMarkdown, saveStatus]);

  const flashMessage = React.useCallback((message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 2500);
  }, []);

  const saveMarkdown = React.useCallback(async () => {
    if (!dungeonId) return;

    setSaveStatus('saving');
    try {
      const updatedAt = new Date().toISOString();
      await dungeonRepository.saveMarkdown(dungeonId, markdown, updatedAt);

      const latest = await dungeonRepository.load(dungeonId);
      if (!latest) {
        throw new Error(`Failed to load dungeon after save: dungeon with id ${dungeonId} not found`);
      }
      setDungeonName(latest.name);
      setSavedMarkdown(markdown);
      setSaveStatus('saved');

      const event: MarkdownSavedEvent = {
        type: 'MARKDOWN_SAVED',
        payload: {
          dungeonId,
          markdown,
          updatedAt,
        },
      };
      channelRef.current?.postMessage(event);
    } catch {
      setSaveStatus('failed');
    }
  }, [dungeonId, markdown]);

  useEffect(() => {
    if (loading || !dungeonId) return;
    if (markdown === savedMarkdown) return;
    const timer = window.setTimeout(() => {
      void saveMarkdown();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dungeonId, loading, markdown, saveMarkdown, savedMarkdown]);

  const handleExportMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(dungeonName)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMarkdown = () => {
    importFileRef.current?.click();
  };

  const handleImportFileChange = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setMarkdown(text);
      flashMessage('Imported markdown');
    } catch {
      flashMessage('Import failed');
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = '';
      }
    }
  }, [flashMessage]);

  const handlePrint = async () => {
    const printWindow = window.open('', '_blank');
    console.log('PDF export: window opened', printWindow);
    if (!printWindow) {
      flashMessage('Could not open print window. Please allow popups.');
      return;
    }
    if (printWindow === window) {
      flashMessage('Could not open print window. Please allow popups.');
      return;
    }
    console.log('PDF export: markdown length', markdown.length);
    console.log('PDF export: generated HTML length', previewHtml.length);
    const lang = document.documentElement.lang || navigator.language || 'en';

    printWindow.document.open();
    printWindow.document.write(buildPrintDocumentHtml(dungeonName, previewHtml, lang));
    printWindow.document.close();
    console.log('PDF export: document written');

    const closeWindow = () => {
      if (!printWindow.closed && printWindow !== window) {
        printWindow.close();
      }
    };

    const fallbackCloseTimer = window.setTimeout(closeWindow, PRINT_WINDOW_CLOSE_TIMEOUT_MS);
    const handleAfterPrint = () => {
      window.clearTimeout(fallbackCloseTimer);
      closeWindow();
    };
    printWindow.addEventListener('afterprint', handleAfterPrint, { once: true });

    const waitForReady = new Promise<void>((resolve) => {
      let settled = false;
      let readyTimeout: number | null = null;
      let loadListenerAttached = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (readyTimeout !== null) {
          window.clearTimeout(readyTimeout);
        }
        if (loadListenerAttached) {
          printWindow.removeEventListener('load', loadHandler);
        }
        resolve();
      };
      const loadHandler = () => {
        settle();
      };
      readyTimeout = window.setTimeout(() => {
        settle();
      }, PRINT_WINDOW_READY_TIMEOUT_MS);

      if (printWindow.document.readyState === 'complete') {
        settle();
        return;
      }

      loadListenerAttached = true;
      printWindow.addEventListener('load', loadHandler, { once: true });

      const readyStateAfterListener = String(printWindow.document.readyState);
      if (readyStateAfterListener === 'complete') {
        settle();
      }
    });

    await waitForReady;

    if ('fonts' in printWindow.document) {
      try {
        await printWindow.document.fonts.ready;
      } catch {
        // ignore font readiness errors and continue to print
      }
    }
    console.log('PDF export: fonts ready');

    if (printWindow.closed) return;
    printWindow.focus();
    console.log('PDF export: calling print');
    printWindow.print();
  };

  if (loading) {
    return <div className="markdown-window-loading">Loading...</div>;
  }

  if (loadError) {
    return <div className="markdown-window-loading">{loadError}</div>;
  }

  return (
    <div className="markdown-window">
      <header className="markdown-window-header">{dungeonName}</header>
      <div className="markdown-window-divider" />

      <div className="markdown-window-controls">
        <button onClick={() => void saveMarkdown()}>Save</button>
        <button onClick={handleImportMarkdown}>Import Markdown</button>
        <button onClick={handleExportMarkdown}>Export Markdown</button>
        <button onClick={handlePrint}>Export PDF</button>

        <span className="markdown-window-spacer" />

        <button onClick={() => setMode('edit')} disabled={mode === 'edit'}>Edit</button>
        <button onClick={() => setMode('preview')} disabled={mode === 'preview'}>Preview</button>
        <button onClick={() => setMode('split')} disabled={mode === 'split'}>Split</button>

        <span className={`markdown-window-status markdown-window-status--${saveStatus}`}>
          {statusLabel(saveStatus)}
        </span>
        {actionMessage && <span className="markdown-window-message">{actionMessage}</span>}
      </div>

      <div className="markdown-window-divider" />

      <div className={`markdown-window-main markdown-window-main--${mode}`}>
        {mode !== 'preview' && (
          <section className="markdown-window-pane markdown-window-pane--editor">
            <MarkdownEasyMDE value={markdown} onChange={setMarkdown} />
          </section>
        )}

        {mode !== 'edit' && (
          <section className="markdown-window-pane markdown-window-pane--preview">
            <div
              className="markdown-preview-body markdown-body"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </section>
        )}
      </div>

      <input
        ref={importFileRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />
    </div>
  );
}
