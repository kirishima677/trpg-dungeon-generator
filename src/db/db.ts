import Dexie, { type Table } from 'dexie';
import type { DungeonDocument, Piece } from '../model/types';

export interface AppSettings {
  key: string;
  value: unknown;
}

export class DungeonDB extends Dexie {
  dungeons!: Table<DungeonDocument, string>;
  pieceLibrary!: Table<Piece, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('TRPGDungeonDB');
    this.version(1).stores({
      dungeons: 'id, name, updatedAt',
      pieceLibrary: 'id, name, shape',
      settings: 'key',
    });
  }
}

export const db = new DungeonDB();
