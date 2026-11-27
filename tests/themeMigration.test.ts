import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Dexie from 'dexie';
import { DungeonDB } from '../src/db/db';
import { entityDungeon,contentFixture } from './fixtures/entityFixture';
import { createEntityInstance } from '../src/model/entity';
test('v2 to v3 adds only dungeonThemes while Dungeon/Entity/Piece/Content/Markdown/settings survive byte-for-byte',async()=>{
  const old=new Dexie('TRPGDungeonDB');old.version(1).stores({dungeons:'id, name, updatedAt',pieceLibrary:'id, name, shape',settings:'key'});old.version(2).stores({contentDefinitions:'id, kind, name, updatedAt'});
  const d=entityDungeon();d.entities=[createEntityInstance('room-0',contentFixture(),d.rooms,4)];const piece={...d.rooms[0].piece,id:'custom'},setting={key:'print',value:{scale:25.4}};
  await old.table('dungeons').add(d);await old.table('pieceLibrary').add(piece);await old.table('contentDefinitions').add(contentFixture());await old.table('settings').add(setting);old.close();
  const upgraded=new DungeonDB();try{await upgraded.open();assert.equal(upgraded.verno,3);assert.equal(await upgraded.dungeonThemes.count(),0);assert.deepEqual(await upgraded.dungeons.get(d.id),d);assert.deepEqual(await upgraded.pieceLibrary.get(piece.id),piece);assert.deepEqual(await upgraded.contentDefinitions.get(contentFixture().id),contentFixture());assert.deepEqual(await upgraded.settings.get('print'),setting);}finally{await upgraded.delete();}
});
