import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { normalizeDungeonDocument } from '../model';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import type { Connection, ConnectionType, ConnectorEndpoint, DungeonDocument, PlacedRoom, Piece, Rotation } from '../model/types';
import { canConnect, endpointExists, usesEndpoint } from '../model/connections';
import { getWorldCells } from '../utils/geometry';
import { SCHEMA_VERSION } from '../utils/exportImport';

const MAX_HISTORY = 50;

// ─── Canvas view state ───────────────────────────────────────────────────────

export interface ViewState {
  zoom: number;       // scale factor
  panX: number;       // canvas offset X in pixels
  panY: number;       // canvas offset Y in pixels
}

// ─── Editor mode ─────────────────────────────────────────────────────────────

export type EditorMode = 'select' | 'place' | 'delete' | 'connect';

// ─── Store state ─────────────────────────────────────────────────────────────

export interface DungeonStore {
  dungeon: DungeonDocument;
  selectedRoomId: string | null;
  selectedConnectionId: string | null;
  pendingConnector: ConnectorEndpoint | null;
  connectionType: ConnectionType;
  editorMode: EditorMode;
  /** Piece being placed (pending) */
  pendingPiece: Piece | null;
  view: ViewState;

  // ── Undo / Redo stacks (hold dungeon snapshots) ───────────────────────────
  undoStack: DungeonDocument[];
  redoStack: DungeonDocument[];

  // ── Dungeon actions ───────────────────────────────────────────────────────
  setDungeon: (dungeon: DungeonDocumentInput) => void;
  newDungeon: () => void;

  // ── Room actions ──────────────────────────────────────────────────────────
  addRoom: (room: PlacedRoom) => void;
  moveRoom: (id: string, position: { x: number; y: number }) => void;
  rotateRoom: (id: string) => void;
  deleteRoom: (id: string) => void;
  selectRoom: (id: string | null) => void;

  addConnection: (from: ConnectorEndpoint, to: ConnectorEndpoint, type?: ConnectionType) => boolean;
  deleteConnection: (id: string) => void;
  selectConnection: (id: string | null) => void;
  chooseConnector: (endpoint: ConnectorEndpoint) => void;
  cancelConnection: () => void;
  setConnectionType: (type: ConnectionType) => void;

  // ── Editor ────────────────────────────────────────────────────────────────
  setEditorMode: (mode: EditorMode) => void;
  setPendingPiece: (piece: Piece | null) => void;

  // ── View ──────────────────────────────────────────────────────────────────
  setView: (view: Partial<ViewState>) => void;
  resetView: () => void;

  // ── History ───────────────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
}

// ─── Initial values ───────────────────────────────────────────────────────────

function createEmptyDungeon(): DungeonDocument {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name: '新しいダンジョン',
    version: SCHEMA_VERSION,
    rooms: [],
    connections: [],
    markdown: '',
    meta: { gridSize: 40 },
    createdAt: now,
    updatedAt: now,
  };
}

const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function snapshot(dungeon: DungeonDocument): DungeonDocument {
  return JSON.parse(JSON.stringify(dungeon));
}

function touch(dungeon: DungeonDocument): DungeonDocument {
  return { ...dungeon, updatedAt: new Date().toISOString() };
}

/**
 * Check if the cells of `incoming` overlap with any existing room (excluding
 * the room with `excludeId`).
 */
function hasCollision(
  incoming: PlacedRoom,
  rooms: PlacedRoom[],
  excludeId?: string
): boolean {
  const newCells = getWorldCells(incoming);
  const newSet = new Set(newCells.map(c => `${c.x},${c.y}`));

  for (const room of rooms) {
    if (room.id === excludeId) continue;
    const existing = getWorldCells(room);
    if (existing.some(c => newSet.has(`${c.x},${c.y}`))) return true;
  }
  return false;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDungeonStore = create<DungeonStore>((set, get) => ({
  dungeon: createEmptyDungeon(),
  selectedRoomId: null,
  selectedConnectionId: null,
  pendingConnector: null,
  connectionType: 'corridor',
  editorMode: 'select',
  pendingPiece: null,
  view: DEFAULT_VIEW,
  undoStack: [],
  redoStack: [],

  // ── Dungeon ───────────────────────────────────────────────────────────────
  setDungeon(dungeon) {
    set({
      dungeon: normalizeDungeonDocument(dungeon),
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      pendingPiece: null,
      editorMode: 'select',
      undoStack: [],
      redoStack: [],
    });
  },

  newDungeon() {
    set({
      dungeon: createEmptyDungeon(),
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      pendingPiece: null,
      editorMode: 'select',
      undoStack: [],
      redoStack: [],
    });
  },

  // ── Internal helper: push to undo & update ────────────────────────────────
  // (not exposed but used via closures below)

  addRoom(room) {
    const { dungeon, undoStack } = get();
    if (hasCollision(room, dungeon.rooms)) return; // silent collision guard

    const next = touch({ ...dungeon, rooms: [...dungeon.rooms, room] });
    set({
      dungeon: next,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  moveRoom(id, position) {
    const { dungeon, undoStack } = get();
    const roomIdx = dungeon.rooms.findIndex(r => r.id === id);
    if (roomIdx === -1) return;

    const updated = { ...dungeon.rooms[roomIdx], position };
    if (updated.position.x === dungeon.rooms[roomIdx].position.x
      && updated.position.y === dungeon.rooms[roomIdx].position.y) return;
    if (hasCollision(updated, dungeon.rooms, id)) return;

    const rooms = dungeon.rooms.map(r => r.id === id ? updated : r);
    const next = touch({ ...dungeon, rooms });
    set({
      dungeon: next,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  rotateRoom(id) {
    const { dungeon, undoStack } = get();
    const room = dungeon.rooms.find(r => r.id === id);
    if (!room) return;

    const rotations: Rotation[] = [0, 90, 180, 270];
    const nextRot = rotations[(rotations.indexOf(room.rotation) + 1) % 4];
    const updated = { ...room, rotation: nextRot };
    if (hasCollision(updated, dungeon.rooms, id)) return;

    const rooms = dungeon.rooms.map(r => r.id === id ? updated : r);
    const next = touch({ ...dungeon, rooms });
    set({
      dungeon: next,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  deleteRoom(id) {
    const { dungeon, undoStack } = get();
    if (!dungeon.rooms.some(room => room.id === id)) return;
    const rooms = dungeon.rooms.filter(r => r.id !== id);
    const connections = dungeon.connections.filter(c => c.fromRoomId !== id && c.toRoomId !== id);
    const next = touch({ ...dungeon, rooms, connections });
    set({
      dungeon: next,
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  selectRoom(id) {
    set({ selectedRoomId: id, selectedConnectionId: null });
  },

  addConnection(from, to, type = get().connectionType) {
    const { dungeon, undoStack } = get();
    if (!['corridor', 'door', 'stairs', 'secret'].includes(type)
      || !canConnect(dungeon.rooms, dungeon.connections, from, to)) return false;
    const connection: Connection = {
      id: uuid(),
      fromRoomId: from.roomId,
      fromConnectorId: from.connectorId,
      toRoomId: to.roomId,
      toConnectorId: to.connectorId,
      type,
    };
    set({
      dungeon: touch({ ...dungeon, connections: [...dungeon.connections, connection] }),
      pendingConnector: null,
      selectedRoomId: null,
      selectedConnectionId: connection.id,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
    return true;
  },

  deleteConnection(id) {
    const { dungeon, undoStack } = get();
    if (!dungeon.connections.some(c => c.id === id)) return;
    set({
      dungeon: touch({ ...dungeon, connections: dungeon.connections.filter(c => c.id !== id) }),
      selectedConnectionId: null,
      pendingConnector: null,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  selectConnection(id) {
    set({ selectedConnectionId: id, selectedRoomId: null, pendingConnector: null });
  },

  chooseConnector(endpoint) {
    const { dungeon, editorMode, pendingConnector } = get();
    if (editorMode !== 'connect' || !endpointExists(dungeon.rooms, endpoint)
      || dungeon.connections.some(c => usesEndpoint(c, endpoint))) return;
    if (!pendingConnector) {
      set({ pendingConnector: endpoint, selectedConnectionId: null, selectedRoomId: null });
    } else if (pendingConnector.roomId === endpoint.roomId
      && pendingConnector.connectorId === endpoint.connectorId) {
      set({ pendingConnector: null });
    } else {
      get().addConnection(pendingConnector, endpoint);
    }
  },

  cancelConnection() { set({ pendingConnector: null }); },
  setConnectionType(type) { set({ connectionType: type }); },

  // ── Editor ────────────────────────────────────────────────────────────────
  setEditorMode(mode) {
    set({ editorMode: mode, pendingPiece: mode !== 'place' ? null : get().pendingPiece,
      pendingConnector: null, selectedConnectionId: null, selectedRoomId: null });
  },

  setPendingPiece(piece) {
    set({ pendingPiece: piece, editorMode: piece ? 'place' : 'select',
      pendingConnector: null, selectedConnectionId: null, selectedRoomId: null });
  },

  // ── View ──────────────────────────────────────────────────────────────────
  setView(partial) {
    set(state => ({ view: { ...state.view, ...partial } }));
  },

  resetView() {
    set({ view: DEFAULT_VIEW });
  },

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  undo() {
    const { undoStack, dungeon, redoStack } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      dungeon: prev,
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      undoStack: undoStack.slice(0, -1),
      redoStack: [snapshot(dungeon), ...redoStack].slice(0, MAX_HISTORY),
    });
  },

  redo() {
    const { redoStack, dungeon, undoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    set({
      dungeon: next,
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      redoStack: redoStack.slice(1),
      undoStack: [...undoStack, snapshot(dungeon)].slice(-MAX_HISTORY),
    });
  },
}));
