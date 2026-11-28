import type { Diagnostic } from './diagnostic';
import type { DungeonDocument } from './types';
import type { DungeonDocumentInput } from './normalizeDungeon';
import { normalizeDungeonDocument } from './normalizeDungeon';
import { normalizeConnections } from './connections';
import { roomInformationError } from './roomInformation';
import { isStandardPiece, normalizePiece, pieceStructure } from '../editor/pieces/pieceDefinition';
import { DEFAULT_PIECES } from './pieceLibrary';
import { ENTITY_LIMITS } from './entity';

export type DungeonValidationResult =
  | { valid: true; document: DungeonDocument; diagnostics: Diagnostic[] }
  | { valid: false; diagnostics: Diagnostic[] };

/** Strict boundary validation, separate from tolerant legacy normalization. No UI, DB or clock. */
export function validateDungeonDocument(value: unknown, options: { requireRoomInformation?: boolean } = {}): DungeonValidationResult {
  const diagnostics: Diagnostic[] = [];
  const fail = (code: string, message: string, roomId?: string) => diagnostics.push({ code, severity: 'error', category: code === 'connection-invalid' ? 'reference' : 'structure', message, ...(roomId ? { context: { roomId } } : {}) });
  try {
    const dungeon = value as DungeonDocumentInput;
    if (!dungeon || typeof dungeon !== 'object' || Array.isArray(dungeon)
      || typeof dungeon.id !== 'string' || !dungeon.id.trim() || typeof dungeon.name !== 'string'
      || !Array.isArray(dungeon.rooms) || !dungeon.meta || !Number.isFinite(dungeon.meta.gridSize)
      || (dungeon.markdown !== undefined && typeof dungeon.markdown !== 'string')) {
      fail('dungeon-invalid', 'Invalid dungeon document');
      return { valid: false, diagnostics };
    }
    const roomIds = new Set<string>(), numbers = new Set<string>(), pieces = new Map<string, string>();
    const requireInfo = options.requireRoomInformation ?? !['1.0.0', '1.1.0'].includes(dungeon.version);
    for (const room of dungeon.rooms) {
      if (!room || typeof room.id !== 'string' || !room.id.trim() || roomIds.has(room.id)
        || !room.position || !Number.isFinite(room.position.x) || !Number.isFinite(room.position.y)
        || ![0, 90, 180, 270].includes(room.rotation)
        || !room.piece || !Array.isArray(room.piece.cells) || !room.piece.cells.length
        || !Array.isArray(room.piece.connectors)) {
        fail('room-invalid', 'Invalid room: duplicate ID or invalid structure', room?.id);
        continue;
      }
      roomIds.add(room.id);
      if (requireInfo) {
        const error = roomInformationError(room.information, numbers);
        if (error) fail('room-information-invalid', `Invalid room information: ${error}`, room.id);
        else numbers.add(room.information!.number.trim());
      }
      try {
        if (room.pieceId !== room.piece.id) throw new Error('Invalid piece reference');
        const piece = normalizePiece(room.piece), signature = pieceStructure(piece);
        if (isStandardPiece(room.pieceId) && signature !== pieceStructure(DEFAULT_PIECES.find(p => p.id === room.pieceId)!)) throw new Error('Invalid standard piece definition');
        if (pieces.has(piece.id) && pieces.get(piece.id) !== signature) throw new Error('Conflicting piece definitions');
        pieces.set(piece.id, signature);
      } catch (error) { fail('piece-invalid', (error as Error).message, room.id); }
    }
    if (diagnostics.length) return { valid: false, diagnostics };
    const document = normalizeDungeonDocument(dungeon);
    // Validate model references before checking links, preserving existing error precedence.
    // Never let normalization silently remove a current explicit connection.
    if (dungeon.connections !== undefined
      && (!Array.isArray(dungeon.connections) || normalizeConnections(dungeon.rooms, dungeon.connections).length !== dungeon.connections.length)) {
      fail('connection-invalid', 'Invalid connections: missing reference, duplicate endpoint or invalid type');
    }
    if (diagnostics.length) return { valid: false, diagnostics };
    if (new TextEncoder().encode(JSON.stringify(document)).length > ENTITY_LIMITS.dungeonJsonBytes) {
      fail('document-size', 'Dungeon JSONは20 MiBまでです。');
      return { valid: false, diagnostics };
    }
    return { valid: true, document, diagnostics };
  } catch (error) {
    fail('document-invalid', error instanceof Error ? error.message : 'Invalid dungeon document');
    return { valid: false, diagnostics };
  }
}

export function assertDungeonDocument(value: unknown, options?: { requireRoomInformation?: boolean }): DungeonDocument {
  const result = validateDungeonDocument(value, options);
  if (!result.valid) throw new Error(result.diagnostics.map(d => d.message).join(' '));
  return result.document;
}
