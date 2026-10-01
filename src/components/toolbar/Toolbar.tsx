import React from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import type { ConnectionType } from '../../model/types';

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

interface ToolbarProps {
  onOpenMarkdown: () => void;
}

export function Toolbar({ onOpenMarkdown }: ToolbarProps) {
  const {
    editorMode,
    setEditorMode,
    connectionType,
    setConnectionType,
    pendingConnector,
    cancelConnection,
    undo,
    redo,
    undoStack,
    redoStack,
    resetView,
    selectedRoomId,
    rotateRoom,
    deleteRoom,
  } = useDungeonStore(useShallow(s => ({
    editorMode: s.editorMode,
    setEditorMode: s.setEditorMode,
    connectionType: s.connectionType,
    setConnectionType: s.setConnectionType,
    pendingConnector: s.pendingConnector,
    cancelConnection: s.cancelConnection,
    undo: s.undo,
    redo: s.redo,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    resetView: s.resetView,
    selectedRoomId: s.selectedRoomId,
    rotateRoom: s.rotateRoom,
    deleteRoom: s.deleteRoom,
  })));

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
      <ToolButton active={editorMode === 'select'} onClick={() => setEditorMode('select')} title="選択 (V)">
        ↖
      </ToolButton>
      <ToolButton active={editorMode === 'connect'} onClick={() => setEditorMode('connect')} title="接続 (C)">
        🔗
      </ToolButton>
      <ToolButton active={editorMode === 'delete'} onClick={() => setEditorMode('delete')} title="削除 (D)">
        🗑
      </ToolButton>

      {editorMode === 'connect' && (
        <>
          <select aria-label="新しい接続の種類" value={connectionType}
            onChange={e => setConnectionType(e.target.value as ConnectionType)}>
            <option value="corridor">通路</option>
            <option value="door">ドア</option>
            <option value="stairs">階段</option>
            <option value="secret">隠し通路</option>
          </select>
          <span role="status" style={{ fontSize: 12, color: '#475569', margin: '0 6px' }}>
            {pendingConnector ? '別の部屋の白い接続点を選択' : '白い接続点を2つ選択（青: 選択中／灰: 接続済み）'}
          </span>
          {pendingConnector && <button onClick={cancelConnection}>キャンセル (Esc)</button>}
        </>
      )}

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

      <button
        onClick={onOpenMarkdown}
        style={{
          marginLeft: 8,
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: '#f8fafc',
          color: '#0f172a',
          padding: '8px 12px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Markdown
      </button>
    </div>
  );
}
