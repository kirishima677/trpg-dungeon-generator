// ─── Direction & Connector ───────────────────────────────────────────────────

export type ConnectorDirection = 'north' | 'south' | 'east' | 'west';
export type ConnectorKind = 'open' | 'door' | 'secret' | 'locked';

/**
 * A connection point on a piece.
 * `position` is relative to the piece's local grid origin (top-left = 0,0).
 */
export interface Connector {
  id: string;
  direction: ConnectorDirection;
  /** Width of the opening in grid cells */
  width: number;
  kind: ConnectorKind;
  /** Position in piece-local grid coordinates */
  position: { x: number; y: number };
}

// ─── Piece (template / library entry) ────────────────────────────────────────

export type PieceShape = 'rectangle' | 'l-shape' | 'corridor';

/**
 * A reusable piece template stored in the piece library.
 * `cells` lists every grid cell the piece occupies (piece-local coords).
 */
export interface Piece {
  id: string;
  name: string;
  shape: PieceShape;
  /** All grid cells occupied by this piece (piece-local coords) */
  cells: { x: number; y: number }[];
  connectors: Connector[];
  tags?: string[];
}

// ─── PlacedRoom (instance on the canvas) ────────────────────────────────────

export type Rotation = 0 | 90 | 180 | 270;

/**
 * A piece placed on the dungeon canvas.
 */
export interface PlacedRoom {
  id: string;
  /** Reference to the Piece template id */
  pieceId: string;
  /** Snapshot of the piece at placement time */
  piece: Piece;
  /** Canvas position in grid coordinates (top-left cell of the bounding box) */
  position: { x: number; y: number };
  rotation: Rotation;
  /**
   * Map of connector id -> { roomId, connectorId } of the target.
   * Only populated when two connectors are explicitly joined.
   */
  connections: Record<string, { roomId: string; connectorId: string }>;
}

// ─── DungeonDocument ─────────────────────────────────────────────────────────

export interface DungeonMeta {
  gridSize: number; // pixels per grid cell
  background?: string;
}

export interface DungeonDocument {
  id: string;
  name: string;
  /** Semantic version string, e.g. "1.0.0" */
  version: string;
  rooms: PlacedRoom[];
  markdown: string;
  meta: DungeonMeta;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ─── Export / Import envelope ─────────────────────────────────────────────────

export interface ExportEnvelope {
  /** Format identifier so importers can detect the file type */
  formatId: 'trpg-dungeon-generator';
  /** Schema version for forward-compat handling */
  schemaVersion: string;
  exportedAt: string;
  dungeon: DungeonDocument;
}
