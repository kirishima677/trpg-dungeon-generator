import React, { useRef, useCallback, useEffect } from 'react';
import { GridCanvas } from '../canvas/GridCanvas';
import { PlacedRoomSvg } from '../pieces/PlacedRoomSvg';
import { PiecePlacementGhost } from '../pieces/PiecePlacementGhost';
import { PieceSidebar } from '../sidebar/PieceSidebar';
import { Toolbar } from '../toolbar/Toolbar';
import { MenuBar } from '../ui/MenuBar';
import { PropertiesPanel } from '../ui/PropertiesPanel';
import { useDungeonStore } from '../../store';

export function Editor() {
  const { dungeon, selectedRoomId, selectRoom, undo, redo, rotateRoom } = useDungeonStore(s => ({
    dungeon: s.dungeon,
    selectedRoomId: s.selectedRoomId,
    selectRoom: s.selectRoom,
    undo: s.undo,
    redo: s.redo,
    rotateRoom: s.rotateRoom,
  }));

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); redo();
      }
      if (e.key === 'r' || e.key === 'R') {
        if (selectedRoomId) rotateRoom(selectedRoomId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedRoomId, rotateRoom]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      // Deselect when clicking on grid background (the pattern rect)
      if (target.tagName === 'rect' && target.getAttribute('fill')?.startsWith('url')) {
        selectRoom(null);
      }
    },
    [selectRoom]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Menu bar */}
      <MenuBar />

      {/* Toolbar */}
      <Toolbar />

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
