import { db } from '../db';
import type { DungeonDB } from '../db/db';
import type { DungeonDocument, Piece } from '../model/types';
import { isStandardPiece, normalizePiece, pieceStructure, samePiece } from '../editor/pieces/pieceDefinition';
import { withPieceReferenceCheck } from '../editor/pieces/pieceReferences';
import type { PieceReferenceGuard } from '../editor/pieces/pieceReferences';
import { publishPieceLibraryUpdate } from '../editor/pieces/pieceEvents';
import { FORMAT_ID, parseImport, SCHEMA_VERSION } from '../utils/exportImport';

export function createPieceRepository(database: DungeonDB = db, guard: PieceReferenceGuard = withPieceReferenceCheck) {
  return {
    async list(): Promise<Piece[]> {
      return (await database.pieceLibrary.orderBy('name').toArray()).filter(p => !isStandardPiece(p.id)).map(normalizePiece);
    },
    async get(id: string): Promise<Piece | undefined> {
      const piece = await database.pieceLibrary.get(id);
      return piece ? normalizePiece(piece) : undefined;
    },
    async save(value: Piece): Promise<Piece> {
      const piece = normalizePiece(value);
      if (isStandardPiece(piece.id)) throw new Error('標準ピースは直接保存できません。複製してください。');
      await database.transaction('rw', database.pieceLibrary, async () => {
        const existing = await database.pieceLibrary.get(piece.id);
        if (existing && pieceStructure(existing) !== pieceStructure(piece)) throw new Error('保存済みピースの形状・接続口は変更できません。複製してください。');
        await database.pieceLibrary.put(piece);
      });
      publishPieceLibraryUpdate();
      return piece;
    },
    /** Validate the complete batch before writing, then commit atomically. */
    async importAll(values: Piece[], allowMetadataDifferences = false): Promise<Piece[]> {
      const pieces = values.map(normalizePiece), unique = new Map<string, Piece>();
      for (const piece of pieces) {
        if (isStandardPiece(piece.id)) throw new Error('標準ピースと同じIDのピースは登録できません。');
        const previous = unique.get(piece.id);
        if (previous && (allowMetadataDifferences ? pieceStructure(previous) !== pieceStructure(piece) : !samePiece(previous, piece))) throw new Error('同じPiece IDに異なる定義があります。');
        unique.set(piece.id, piece);
      }
      await database.transaction('rw', database.pieceLibrary, async () => {
        for (const piece of unique.values()) {
          const existing = await database.pieceLibrary.get(piece.id);
          if (existing && (allowMetadataDifferences ? pieceStructure(existing) !== pieceStructure(piece) : !samePiece(existing, piece))) throw new Error('既存のPiece IDと内容が衝突しています。複製して別IDを使用してください。');
          if (!existing) await database.pieceLibrary.add(piece);
        }
      });
      publishPieceLibraryUpdate();
      return pieces;
    },
    async registerDungeonPieces(dungeon: DungeonDocument) {
      const checked = parseImport({ formatId: FORMAT_ID, schemaVersion: SCHEMA_VERSION, dungeon }).dungeon;
      return this.importAll(checked.rooms.filter(r => !isStandardPiece(r.pieceId)).map(r => r.piece), true);
    },
    async delete(id: string): Promise<void> {
      if (isStandardPiece(id)) throw new Error('標準ピースは削除できません。');
      await guard(async liveIds => {
        if (liveIds.has(id)) throw new Error('編集中のダンジョン・配置待ち・Undo／Redo履歴が参照しているため削除できません。');
        await database.transaction('rw', database.pieceLibrary, database.dungeons, async () => {
          const dungeons = await database.dungeons.toArray();
          for (const dungeon of dungeons) {
            if (!Array.isArray(dungeon.rooms) || dungeon.rooms.some(r => !r || typeof r.pieceId !== 'string' || !r.piece || r.piece.id !== r.pieceId)) throw new Error('保存済みダンジョンの参照を確認できないため削除できません。');
            if (dungeon.rooms.some(r => r.pieceId === id)) throw new Error('保存済みダンジョンが参照しているため削除できません。');
          }
          await database.pieceLibrary.delete(id);
        });
      });
      publishPieceLibraryUpdate();
    },
  };
}

export const pieceRepository = createPieceRepository();
