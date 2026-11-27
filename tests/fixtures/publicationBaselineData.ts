import assert from 'node:assert/strict';

/** Keep the original golden hashes: the Entity schema intentionally adds only version + entities here. */
export function publicationBaselineData(path: string, data: Uint8Array): Uint8Array {
  if (path !== 'project/dungeon.json') return data;
  const value = JSON.parse(new TextDecoder().decode(data));
  assert.equal(value.schemaVersion, '1.3.0'); assert.equal(value.dungeon.version, '1.3.0');
  assert.deepEqual(value.dungeon.entities, []);
  delete value.dungeon.entities; value.schemaVersion = '1.2.0'; value.dungeon.version = '1.2.0';
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}
