import { applyFactionCommand, normalizeFactionState } from '../model/factionState';
import type { FactionCommand } from '../model/factionState';
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { normalizeDungeonDocument } from '../model';
import type { DungeonDocumentInput } from '../model/normalizeDungeon';
import type { Connection, ConnectionType, ConnectorEndpoint, DungeonDocument, PlacedRoom, PlacedRoomInput, Piece, Rotation, RoomInformation } from '../model/types';
import { canConnect, endpointExists, usesEndpoint } from '../model/connections';
import { getWorldCells, pieceBounds } from '../utils/geometry';
import { SCHEMA_VERSION } from '../utils/exportImport';
import { pieceReferencesFrozen } from '../editor/pieces/pieceReferences';
import { nextRoomNumber, normalizeRoomInformation, roomInformationError } from '../model/roomInformation';
import type { RoomLabelVisibility } from '../editor/rooms/roomLabel';
import { applyEntityCommand, checkEntityLimits } from '../model/entity';
import type { EntityCommand } from '../model/entity';
import { createThemeAssignment } from '../model/dungeonTheme';
import type { DungeonTheme } from '../model/dungeonTheme';
import { createRoomThemeAssignment } from '../model/roomTheme';
import type { RoomTheme } from '../model/roomTheme';
import type { ContentDefinition } from '../model/content';
import { prepareRequiredPlacement, requiredPlacementRevision } from '../model/roomThemePlacement';

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
  roomLabels: RoomLabelVisibility;
  showFactions:boolean; setShowFactions:(value:boolean)=>void;
  changeFactions:(command:FactionCommand)=>string|null;

  // ── Undo / Redo stacks (hold dungeon snapshots) ───────────────────────────
  undoStack: DungeonDocument[];
  redoStack: DungeonDocument[];

  // ── Dungeon actions ───────────────────────────────────────────────────────
  setDungeon: (dungeon: DungeonDocumentInput) => void;
  newDungeon: () => void;
  changeEntities: (command: EntityCommand) => string | null;
  assignTheme: (theme: DungeonTheme | null) => string | null;
  assignRoomTheme: (roomId: string, theme: RoomTheme | null) => string | null;
  placeRequiredContents: (roomId: string, contents: readonly ContentDefinition[], pieces: readonly Piece[], reviewedRevision: string, allowConflicts?: boolean) => string | null;
  duplicateRoom: (roomId: string) => string | null;

  // ── Room actions ──────────────────────────────────────────────────────────
  addRoom: (room: PlacedRoomInput) => void;
  updateRoomInformation: (id: string, information: RoomInformation) => string | null;
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
  setRoomLabels: (labels: Partial<RoomLabelVisibility>) => void;

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
    entities: [], factions:[],factionRelations:[],roomFactionAssignments:[],
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
  incoming: PlacedRoomInput,
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
  roomLabels: { numbers: true, names: true },
  undoStack: [],
  redoStack: [],
  showFactions:false,
  setShowFactions(value){set({showFactions:value});},
  changeFactions(command){
    const {dungeon,undoStack}=get();
    try { const changes=applyFactionCommand(dungeon,command);
      if(JSON.stringify(changes)===JSON.stringify({factions:dungeon.factions,factionRelations:dungeon.factionRelations,roomFactionAssignments:dungeon.roomFactionAssignments,entities:dungeon.entities}))return null;
      set({dungeon:touch({...dungeon,...changes}),undoStack:[...undoStack.slice(-MAX_HISTORY+1),snapshot(dungeon)],redoStack:[]});return null;
    }catch(e){return e instanceof Error?e.message:"勢力を変更できませんでした。";}
  },

  // ── Dungeon ───────────────────────────────────────────────────────────────
  setDungeon(dungeon) {
    if (pieceReferencesFrozen()) throw new Error('ピースの参照確認中です。もう一度操作してください。');
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

  changeEntities(command) {
    const { dungeon, undoStack } = get();
    try {
      const entities = applyEntityCommand(dungeon.entities, dungeon.rooms, command);
      if(entities) normalizeFactionState(dungeon,dungeon.rooms,entities);
      if (entities) set({ dungeon: touch({ ...dungeon, entities }),
        undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)], redoStack: [] });
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'Entityを変更できませんでした。'; }
  },

  assignTheme(value) {
    const { dungeon, undoStack } = get();
    try {
      const theme = value ? createThemeAssignment(value) : undefined;
      if (JSON.stringify(theme) === JSON.stringify(dungeon.theme)) return null;
      const { theme: _previous, ...base } = dungeon;
      set({ dungeon: touch({ ...base, ...(theme ? { theme } : {}) }),
        undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)], redoStack: [] });
      return null;
    } catch (e) { return e instanceof Error ? e.message : 'テーマを適用できませんでした。'; }
  },

  assignRoomTheme(roomId, value) {
    const { dungeon, undoStack } = get();
    try {
      const room = dungeon.rooms.find(r => r.id === roomId);
      if (!room) throw new Error('部屋が見つかりません。');
      const roomTheme = value ? createRoomThemeAssignment(value) : undefined;
      if (JSON.stringify(roomTheme) === JSON.stringify(room.roomTheme)) return null;
      const { roomTheme: _previous, ...base } = room;
      set({ dungeon: touch({ ...dungeon, rooms: dungeon.rooms.map(r => r.id === roomId ? { ...base, ...(roomTheme ? { roomTheme } : {}) } : r) }),
        undoStack: [...undoStack.slice(-MAX_HISTORY + 1),snapshot(dungeon)],redoStack:[] });
      return null;
    } catch(e) { return e instanceof Error ? e.message : 'Room Themeを適用できませんでした。'; }
  },

  placeRequiredContents(roomId, contents, pieces, reviewedRevision, allowConflicts = false) {
    const { dungeon, undoStack } = get();
    try {
      if (requiredPlacementRevision(dungeon,roomId,contents,pieces) !== reviewedRevision) throw new Error('配置予定が変わりました。プレビューを確認し直してください。');
      const plan = prepareRequiredPlacement(dungeon,roomId,contents,pieces);
      if (plan.blockers.length) throw new Error(plan.blockers.join(' '));
      if (!plan.added.length) return null;
      if (plan.conflicts.length && !allowConflicts) throw new Error('素材選択条件との競合を確認して続行してください。');
      set({ dungeon:touch({ ...dungeon,entities:[...dungeon.entities,...plan.added] }),
        undoStack:[...undoStack.slice(-MAX_HISTORY + 1),snapshot(dungeon)],redoStack:[] });
      return null;
    } catch(e) { return e instanceof Error ? e.message : '必須Contentを配置できませんでした。'; }
  },

  duplicateRoom(roomId) {
    if (pieceReferencesFrozen()) return 'ピース参照の確認中です。もう一度操作してください。';
    const { dungeon,undoStack } = get(), source = dungeon.rooms.find(r => r.id === roomId);
    if (!source) return '部屋が見つかりません。';
    try {
      const room = structuredClone(source); room.id = uuid();
      room.information.number = nextRoomNumber(dungeon.rooms.map(r => r.information.number));
      const { w,h } = pieceBounds(room.piece,room.rotation);
      let found = false;
      for (let i = 1;i <= 512;i++) {
        room.position = { x:source.position.x + (i % 16) * (w + 1),y:source.position.y + Math.floor(i / 16) * (h + 1) };
        if (!hasCollision(room,dungeon.rooms)) { found = true; break; }
      }
      if (!found) throw new Error('複製先の空き領域が見つかりません。');
      const entities = [...dungeon.entities,...dungeon.entities.filter(e => e.roomId === roomId).map(e => ({ ...structuredClone(e),id:uuid(),roomId:room.id }))];
      checkEntityLimits(entities);
      set({ dungeon:touch({ ...dungeon,rooms:[...dungeon.rooms,room],entities,roomFactionAssignments:[...dungeon.roomFactionAssignments,...dungeon.roomFactionAssignments.filter(a=>a.roomId===roomId).map(a=>({...structuredClone(a),roomId:room.id}))] }),selectedRoomId:room.id,selectedConnectionId:null,pendingConnector:null,
        undoStack:[...undoStack.slice(-MAX_HISTORY + 1),snapshot(dungeon)],redoStack:[] });
      return null;
    } catch(e) { return e instanceof Error ? e.message : '部屋を複製できませんでした。'; }
  },

  // ── Internal helper: push to undo & update ────────────────────────────────
  // (not exposed but used via closures below)

  addRoom(room) {
    if (pieceReferencesFrozen()) return;
    const { dungeon, undoStack } = get();
    if (dungeon.rooms.some(existing => existing.id === room.id) || hasCollision(room, dungeon.rooms)) return;

    const placed: PlacedRoom = { ...room, information: normalizeRoomInformation(room.information,
      nextRoomNumber(dungeon.rooms.map(r => r.information.number))) };
    const next = touch({ ...dungeon, rooms: [...dungeon.rooms, placed] });
    set({
      dungeon: next,
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)],
      redoStack: [],
    });
  },

  updateRoomInformation(id, value) {
    const { dungeon, undoStack } = get();
    const room = dungeon.rooms.find(r => r.id === id);
    if (!room) return '部屋が見つかりません。';
    const error = roomInformationError(value, dungeon.rooms.filter(r => r.id !== id).map(r => r.information.number));
    if (error) return error;
    const information = normalizeRoomInformation(value, value.number.trim());
    if (JSON.stringify(information) === JSON.stringify(room.information)) return null;
    set({ dungeon: touch({ ...dungeon, rooms: dungeon.rooms.map(r => r.id === id ? { ...r, information } : r) }),
      undoStack: [...undoStack.slice(-MAX_HISTORY + 1), snapshot(dungeon)], redoStack: [] });
    return null;
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
    const entities = dungeon.entities.filter(e => e.roomId !== id);
    const next = touch({ ...dungeon, rooms, connections, entities,roomFactionAssignments:dungeon.roomFactionAssignments.filter(a=>a.roomId!==id) });
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
    if (pieceReferencesFrozen()) return;
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

  setRoomLabels(labels) {
    set(state => ({ roomLabels: { ...state.roomLabels, ...labels } }));
  },

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  undo() {
    if (pieceReferencesFrozen()) return;
    const { undoStack, dungeon, redoStack } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      dungeon: { ...prev, markdown: dungeon.markdown },
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      undoStack: undoStack.slice(0, -1),
      redoStack: [snapshot(dungeon), ...redoStack].slice(0, MAX_HISTORY),
    });
  },

  redo() {
    if (pieceReferencesFrozen()) return;
    const { redoStack, dungeon, undoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    set({
      dungeon: { ...next, markdown: dungeon.markdown },
      selectedRoomId: null,
      selectedConnectionId: null,
      pendingConnector: null,
      redoStack: redoStack.slice(1),
      undoStack: [...undoStack, snapshot(dungeon)].slice(-MAX_HISTORY),
    });
  },
}));
