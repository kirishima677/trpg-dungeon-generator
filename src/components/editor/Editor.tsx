import React, { useRef, useCallback, useEffect } from 'react';
import { GridCanvas } from '../canvas/GridCanvas';
import { PlacedRoomSvg } from '../pieces/PlacedRoomSvg';
import { PiecePlacementGhost } from '../pieces/PiecePlacementGhost';
import { ConnectionRenderer } from '../connections/ConnectionRenderer';
import { useConnectionScene } from '../connections/useConnectionScene';
import { ConnectorPoints } from '../connections/ConnectorPoints';
import { PieceSidebar } from '../sidebar/PieceSidebar';
import { Toolbar } from '../toolbar/Toolbar';
import { MenuBar } from '../ui/MenuBar';
import { PropertiesPanel } from '../ui/PropertiesPanel';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import {
  MARKDOWN_CHANNEL_NAME,
  isMarkdownSavedEvent,
} from '../../editor/markdown/events';
import { openMarkdownEditorWindow } from '../../editor/markdown/markdownWindow';
import { createSnapshotProvider } from '../../publishing/snapshotChannel';
import { snapshotWithSavedMarkdown } from '../../publishing/publishSnapshot';
import { dungeonRepository } from '../../repository/dungeonRepository';
import { openEditorWindow } from '../../editor/editorWindows';
import { collectPieceReferences, registerPieceReferenceReader } from '../../editor/pieces/pieceReferences';
import '../themes/themes.css';
const DungeonThemePanel = React.lazy(() => import('../themes/DungeonThemePanel').then(m => ({ default: m.DungeonThemePanel })));

export function Editor() {
  const { dungeon, selectedRoomId, selectRoom, undo, redo, rotateRoom,
    selectedConnectionId, selectConnection, deleteConnection, deleteRoom, cancelConnection, setEditorMode, editorMode } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon,
    selectedRoomId: s.selectedRoomId,
    selectRoom: s.selectRoom,
    undo: s.undo,
    redo: s.redo,
    rotateRoom: s.rotateRoom,
    selectedConnectionId: s.selectedConnectionId,
    selectConnection: s.selectConnection,
    deleteConnection: s.deleteConnection,
    deleteRoom: s.deleteRoom,
    cancelConnection: s.cancelConnection,
    setEditorMode: s.setEditorMode,
    editorMode: s.editorMode,
  })));

  const publishingToken = useRef(crypto.randomUUID());
  const publishingProvider = useRef<ReturnType<typeof createSnapshotProvider> | null>(null);
  const publishRequest = useRef(0);
  useEffect(() => {
    publishingToken.current = crypto.randomUUID();
    publishingProvider.current = createSnapshotProvider(publishingToken.current, dungeon.id);
    return () => { publishingProvider.current?.close(); publishingProvider.current = null; };
  }, [dungeon.id]);

  const connectionScene = useConnectionScene(dungeon.rooms, dungeon.connections);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentDungeonIdRef = useRef(dungeon.id);
  const [referenceReady, setReferenceReady] = React.useState(false);
  const [windowError, setWindowError] = React.useState('');
  const [themeOpen, setThemeOpen] = React.useState(false);

  useEffect(() => {
    let disposed = false, cleanup: (() => void) | undefined;
    void registerPieceReferenceReader(() => {
      const state = useDungeonStore.getState();
      return collectPieceReferences([state.dungeon, ...state.undoStack, ...state.redoStack], state.pendingPiece);
    }).then(stop => {
      if (disposed) stop();
      else { cleanup = stop; setReferenceReady(true); }
    }).catch(() => setWindowError('ピース参照の登録に失敗しました。ページを再読み込みしてください。'));
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    currentDungeonIdRef.current = dungeon.id;
  }, [dungeon.id]);

  // Canvas size
  const [size, setSize] = React.useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (themeOpen || document.querySelector('[aria-modal="true"]')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (document.activeElement as HTMLElement | null)?.isContentEditable) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        if (key === 'y') { e.preventDefault(); redo(); }
        return;
      }
      if (key === 'r' && editorMode === 'select' && selectedRoomId) rotateRoom(selectedRoomId);
      if (key === 'v') setEditorMode('select');
      if (key === 'c') setEditorMode('connect');
      if (key === 'd') setEditorMode('delete');
      if (e.key === 'Escape') { cancelConnection(); selectConnection(null); selectRoom(null); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnectionId) { e.preventDefault(); deleteConnection(selectedConnectionId); }
        else if (selectedRoomId) { e.preventDefault(); deleteRoom(selectedRoomId); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedRoomId, rotateRoom, selectedConnectionId, selectConnection,
    deleteConnection, deleteRoom, cancelConnection, setEditorMode, selectRoom, editorMode, themeOpen]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      // Deselect when clicking on grid background (the pattern rect)
      if (target.tagName === 'rect' && target.getAttribute('fill')?.startsWith('url')) {
        selectRoom(null);
        selectConnection(null);
      }
    },
    [selectRoom, selectConnection]
  );

  const handleOpenMarkdown = useCallback(() => {
    openMarkdownEditorWindow(dungeon.id);
  }, [dungeon.id]);

  useEffect(() => {
    const channel = new BroadcastChannel(MARKDOWN_CHANNEL_NAME);
    channel.onmessage = event => {
      if (!isMarkdownSavedEvent(event.data)) return;
      if (event.data.payload.dungeonId !== currentDungeonIdRef.current) return;

      useDungeonStore.setState(state => ({
        ...state,
        dungeon: {
          ...state.dungeon,
          markdown: event.data.payload.markdown,
          updatedAt: event.data.payload.updatedAt,
        },
      }));
    };

    return () => {
      channel.close();
    };
  }, []);

  return (
    <><div inert={!referenceReady || themeOpen} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Menu bar */}
      <MenuBar />

      {/* Toolbar */}
      <Toolbar onOpenPublishing={() => {
        try {
          const current = useDungeonStore.getState().dungeon;
          const provider = publishingProvider.current, request = ++publishRequest.current;
          if (!provider) throw new Error('出版画面の準備が完了していません。');
          const token = publishingToken.current;
          const opened = openEditorWindow(`publishing-${token}`, { publishing: '1', source: token, dungeonId: current.id }, 'popup=yes,width=1200,height=850');
          setWindowError(opened ? '' : '出版画面を開けませんでした。ポップアップを許可してください。');
          if (opened) void snapshotWithSavedMarkdown(current, id => dungeonRepository.load(id)).then(snapshot => {
            if (request === publishRequest.current && provider === publishingProvider.current) provider.capture(snapshot);
          }).catch(() => {
            if (request === publishRequest.current && provider === publishingProvider.current) setWindowError('保存済みMarkdownを取得できませんでした。もう一度「出版」を押してください。');
          });
        } catch { setWindowError('出版用データを取得できませんでした。ページを再読み込みしてください。'); }
      }} onOpenMarkdown={handleOpenMarkdown} onOpenPieceEditor={() => {
        const opened = openEditorWindow('piece-editor-window', { pieceEditor: '1' }, 'popup=yes,width=1200,height=850');
        setWindowError(opened ? '' : 'ピースエディタを開けませんでした。ポップアップを許可してください。');
      }} onOpenContentEditor={() => {
        const opened = openEditorWindow('content-editor-window', { contentEditor: '1' }, 'popup=yes,width=1200,height=850');
        setWindowError(opened ? '' : 'コンテンツライブラリを開けませんでした。ポップアップを許可してください。');
      }} onOpenThemeEditor={() => {
        const opened = openEditorWindow('dungeon-theme-editor-window', { themeEditor: '1' }, 'popup=yes,width=1200,height=850');
        setWindowError(opened ? '' : 'テーマ管理を開けませんでした。ポップアップを許可してください。');
      }} onOpenThemeSettings={() => {
        cancelConnection(); setThemeOpen(true);
      }} onOpenRoomThemeEditor={() => {
        const opened = openEditorWindow('room-theme-editor-window', { roomThemeEditor:'1' },'popup=yes,width=1200,height=850');
        setWindowError(opened ? '' : 'Room Theme管理を開けませんでした。ポップアップを許可してください。');
      }} />
      {windowError && <p role="alert">{windowError}</p>}

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: piece library */}
        <PieceSidebar />

        {/* Centre: canvas */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', background: '#e2e8f0' }}
          onClick={onCanvasClick}
        >
          <GridCanvas width={size.w} height={size.h} svgRef={svgRef}>
            <ConnectionRenderer scene={connectionScene} layer="corridors" />
            {/* Rendered rooms */}
            {dungeon.rooms.map(room => (
              <PlacedRoomSvg
                key={room.id}
                room={room}
                isSelected={room.id === selectedRoomId}
                openConnectorIds={connectionScene.openConnectorIds.get(room.id)}
              />
            ))}

            <ConnectionRenderer scene={connectionScene} layer="overlays" />
            <ConnectorPoints />

            {/* Ghost for piece placement */}
            <PiecePlacementGhost svgRef={svgRef} />
          </GridCanvas>
        </div>

        {/* Right: properties */}
        <PropertiesPanel />
      </div>
    </div>{themeOpen && <React.Suspense fallback={<div role="status">テーマ設定を読み込んでいます…</div>}><DungeonThemePanel key={dungeon.id} close={() => setThemeOpen(false)} /></React.Suspense>}</>
  );
}
