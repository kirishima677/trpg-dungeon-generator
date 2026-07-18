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
        throw new Error('missing dungeon');
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

  const handlePrint = () => {
    setMode('preview');
    // Two animation frames ensure React applies the mode switch and the preview
    // layout is rendered before the browser opens the print dialog.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
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
