import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Dexie from 'dexie';
import { DungeonDB } from '../src/db/db';
import { entityDungeon,contentFixture } from './fixtures/entityFixture';
import { themeFixture } from './fixtures/themeFixture';
import { createEntityInstance } from '../src/model/entity';
import { createThemeAssignment } from '../src/model/dungeonTheme';
test('v3 to v4 adds roomThemes without rewriting old Dungeon/Theme/Entity/Content/Piece/Markdown/settings bytes',async()=>{
  const old=new Dexie('TRPGDungeonDB');old.version(1).stores({dungeons:'id, name, updatedAt',pieceLibrary:'id, name, shape',settings:'key'});old.version(2).stores({contentDefinitions:'id, kind, name, updatedAt'});old.version(3).stores({dungeonThemes:'id, name, genre, category, updatedAt'});
  const {roomThemeSelection:_new,...legacyTheme}=themeFixture();const d={...entityDungeon(),version:'1.4.0',theme:createThemeAssignment(themeFixture())};delete (d.theme.themeSnapshot as Partial<typeof d.theme.themeSnapshot>).roomThemeSelection;d.entities=[createEntityInstance('room-0',contentFixture(),d.rooms,4)];const piece={...d.rooms[0].piece,id:'custom'},setting={key:'print',value:{scale:25.4}};
  await old.table('dungeons').add(d);await old.table('dungeonThemes').add(legacyTheme);await old.table('pieceLibrary').add(piece);await old.table('contentDefinitions').add(contentFixture());await old.table('settings').add(setting);old.close();const next=new DungeonDB();try{await next.open();assert.equal(next.verno,6);assert.equal(await next.roomThemes.count(),0);assert.deepEqual(await next.dungeons.get(d.id),d);assert.deepEqual(await next.dungeonThemes.get(legacyTheme.id),legacyTheme);assert.deepEqual(await next.pieceLibrary.get(piece.id),piece);assert.deepEqual(await next.contentDefinitions.get(contentFixture().id),contentFixture());assert.deepEqual(await next.settings.get('print'),setting);}finally{await next.delete();}
});
