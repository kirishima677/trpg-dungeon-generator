import Dexie, { type Table } from 'dexie';
import type { DungeonDocument, Piece } from '../model/types';
import type { ContentDefinition } from '../model/content';

export interface AppSettings {
  key: string;
  value: unknown;
}

export class DungeonDB extends Dexie {
  dungeons!: Table<DungeonDocument, string>;
  pieceLibrary!: Table<Piece, string>;
  settings!: Table<AppSettings, string>;
  contentDefinitions!: Table<ContentDefinition, string>;

  constructor() {
    super('TRPGDungeonDB');
    this.version(1).stores({
      dungeons: 'id, name, updatedAt',
      pieceLibrary: 'id, name, shape',
      settings: 'key',
    });
    this.version(2).stores({ contentDefinitions: 'id, kind, name, updatedAt' });
  }
}

export const db = new DungeonDB();
