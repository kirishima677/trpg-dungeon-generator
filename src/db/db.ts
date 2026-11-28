import type { FactionDefinition } from '../model/faction';
import Dexie, { type Table } from 'dexie';
import type { DungeonDocument, Piece } from '../model/types';
import type { ContentDefinition } from '../model/content';
import type { DungeonTheme } from '../model/dungeonTheme';
import type { RoomTheme } from '../model/roomTheme';

export interface AppSettings {
  key: string;
  value: unknown;
}

export class DungeonDB extends Dexie {
  dungeons!: Table<DungeonDocument, string>;
  pieceLibrary!: Table<Piece, string>;
  settings!: Table<AppSettings, string>;
  contentDefinitions!: Table<ContentDefinition, string>;
  dungeonThemes!: Table<DungeonTheme, string>;
  factionDefinitions!: Table<FactionDefinition,string>;
  roomThemes!: Table<RoomTheme, string>;

  constructor() {
    super('TRPGDungeonDB');
    this.version(1).stores({
      dungeons: 'id, name, updatedAt',
      pieceLibrary: 'id, name, shape',
      settings: 'key',
    });
    this.version(2).stores({ contentDefinitions: 'id, kind, name, updatedAt' });
    this.version(3).stores({ dungeonThemes: 'id, name, genre, category, updatedAt' });
    this.version(4).stores({ roomThemes: 'id, name, genre, category, updatedAt' });
    this.version(5).stores({ factionDefinitions: 'id, name, genre, category, updatedAt' });
  }
}

export const db = new DungeonDB();
