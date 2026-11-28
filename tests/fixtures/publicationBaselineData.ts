import assert from 'node:assert/strict';

/** Keep the original golden hashes: schema 1.7 keeps the empty-theme fixture unchanged apart from version + entities. */
export function publicationBaselineData(path: string, data: Uint8Array): Uint8Array {
  if (path !== 'project/dungeon.json') return data;
  const value = JSON.parse(new TextDecoder().decode(data));
  assert.equal(value.schemaVersion, '1.7.0'); assert.equal(value.dungeon.version, '1.7.0');
  assert.ok(value.dungeon.rooms.every((r: object) => !Object.hasOwn(r, 'roomTheme')));
  assert.deepEqual(value.dungeon.entities, []); assert.equal(Object.hasOwn(value.dungeon, 'theme'), false);
  for(const key of ['factions','factionRelations','roomFactionAssignments','encounters']){assert.deepEqual(value.dungeon[key],[]);delete value.dungeon[key];}
  delete value.dungeon.entities; value.schemaVersion = '1.2.0'; value.dungeon.version = '1.2.0';
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}
