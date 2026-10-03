import React, { useRef, useCallback, useEffect } from 'react';
import { GridCanvas } from '../canvas/GridCanvas';
import { PlacedRoomSvg } from '../pieces/PlacedRoomSvg';
import { PiecePlacementGhost } from '../pieces/PiecePlacementGhost';
import { ConnectionRenderer } from '../connections/ConnectionRenderer';
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

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentDungeonIdRef = useRef(dungeon.id);

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
    deleteConnection, deleteRoom, cancelConnection, setEditorMode, selectRoom, editorMode]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Menu bar */}
      <MenuBar />

      {/* Toolbar */}
      <Toolbar onOpenMarkdown={handleOpenMarkdown} />

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
            {/* Rendered rooms */}
            {dungeon.rooms.map(room => (
              <PlacedRoomSvg
                key={room.id}
                room={room}
                isSelected={room.id === selectedRoomId}
              />
            ))}

            <ConnectionRenderer />
            <ConnectorPoints />

            {/* Ghost for piece placement */}
            <PiecePlacementGhost svgRef={svgRef} />
          </GridCanvas>
        </div>

        {/* Right: properties */}
        <PropertiesPanel />
      </div>
    </div>
  );
}
