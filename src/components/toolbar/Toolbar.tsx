import React from 'react';
import { useDungeonStore } from '../../store';
import type { EditorMode } from '../../store/dungeonStore';

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolButton({ active, onClick, title, children }: ToolButtonProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 8,
        border: active ? '2px solid #2563eb' : '2px solid transparent',
        background: active ? '#dbeafe' : '#f1f5f9',
        cursor: 'pointer',
        fontSize: 18,
        color: active ? '#1e3a8a' : '#475569',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export function Toolbar() {
  const {
    editorMode,
    setEditorMode,
    setPendingPiece,
    undo,
    redo,
    undoStack,
    redoStack,
    resetView,
    selectedRoomId,
    rotateRoom,
    deleteRoom,
  } = useDungeonStore(s => ({
    editorMode: s.editorMode,
    setEditorMode: s.setEditorMode,
    setPendingPiece: s.setPendingPiece,
    undo: s.undo,
    redo: s.redo,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    resetView: s.resetView,
    selectedRoomId: s.selectedRoomId,
    rotateRoom: s.rotateRoom,
    deleteRoom: s.deleteRoom,
  }));

  const setMode = (mode: EditorMode) => {
    setEditorMode(mode);
    if (mode !== 'place') setPendingPiece(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        flexWrap: 'wrap',
      }}
    >
      {/* Mode buttons */}
      <ToolButton active={editorMode === 'select'} onClick={() => setMode('select')} title="選択 (V)">
        ↖
      </ToolButton>
      <ToolButton active={editorMode === 'delete'} onClick={() => setMode('delete')} title="削除 (D)">
        🗑
      </ToolButton>

      <div style={{ width: 1, height: 32, background: '#e2e8f0', margin: '0 4px' }} />

      {/* Undo / Redo */}
      <ToolButton active={false} onClick={undo} title="元に戻す (Ctrl+Z)">
        <span style={{ opacity: undoStack.length === 0 ? 0.35 : 1 }}>↩</span>
      </ToolButton>
      <ToolButton active={false} onClick={redo} title="やり直す (Ctrl+Y)">
        <span style={{ opacity: redoStack.length === 0 ? 0.35 : 1 }}>↪</span>
      </ToolButton>

      <div style={{ width: 1, height: 32, background: '#e2e8f0', margin: '0 4px' }} />

      {/* Selected room actions */}
      {selectedRoomId && (
        <>
          <ToolButton
            active={false}
            onClick={() => rotateRoom(selectedRoomId)}
            title="回転 (R)"
          >
            🔄
          </ToolButton>
          <ToolButton
            active={false}
            onClick={() => deleteRoom(selectedRoomId)}
            title="削除 (Del)"
          >
            ❌
          </ToolButton>
          <div style={{ width: 1, height: 32, background: '#e2e8f0', margin: '0 4px' }} />
        </>
      )}

      {/* View */}
      <ToolButton active={false} onClick={resetView} title="表示をリセット">
        🏠
      </ToolButton>
    </div>
  );
}
