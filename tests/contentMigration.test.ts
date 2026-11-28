import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Dexie from 'dexie';
import { DungeonDB } from '../src/db/db';
import { DEFAULT_PIECES } from '../src/model/pieceLibrary';

test('v1 to latest adds library tables and preserves existing Dungeon, Piece, Markdown and settings bytes', async () => {
  const old = new Dexie('TRPGDungeonDB');
  old.version(1).stores({ dungeons: 'id, name, updatedAt', pieceLibrary: 'id, name, shape', settings: 'key' });
  const dungeon = { id: 'legacy', name: '旧ダンジョン', version: '1.2.0', rooms: [], connections: [], markdown: '# 旧Markdown\n秘密', meta: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  const piece = { ...DEFAULT_PIECES[0], id: 'custom-legacy', name: '旧ピース' }, setting = { key: 'appearance', value: { grid: true } };
  await old.table('dungeons').add(dungeon); await old.table('pieceLibrary').add(piece); await old.table('settings').add(setting); old.close();
  const upgraded = new DungeonDB();
  try {
    await upgraded.open(); assert.equal(upgraded.verno, 5);
    assert.deepEqual(await upgraded.dungeons.get('legacy'), dungeon);
    assert.deepEqual(await upgraded.pieceLibrary.get(piece.id), piece); assert.deepEqual(await upgraded.settings.get(setting.key), setting);
    assert.equal(await upgraded.contentDefinitions.count(), 0);
    assert.deepEqual(upgraded.tables.map(t => t.name).sort(), ['contentDefinitions', 'dungeonThemes', 'dungeons', 'factionDefinitions', 'pieceLibrary', 'roomThemes', 'settings']);
  } finally { await upgraded.delete(); }
});
