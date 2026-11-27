import { newTheme } from '../../src/model/dungeonTheme';
import type { DungeonTheme } from '../../src/model/dungeonTheme';
import { CONTENT_KINDS } from '../../src/model/content';
import { contentFixture, entityTimestamp } from './entityFixture';
export function themeFixture(id = 'theme-castle'): DungeonTheme {
  return { ...newTheme(), id, name: '廃棄された古城', genre: 'dark-fantasy', category: 'castle', summary: '地下の施設',
    description: '## 背景\n**古城**', gmNotes: 'THEME_PRIVATE_GM', tags: ['地下', 'castle'], createdAt: entityTimestamp, updatedAt: entityTimestamp };
}
export function privateTheme(): DungeonTheme {
  const t = themeFixture('THEME_PRIVATE_SOURCE');
  for (const field of ['name', 'genre', 'category', 'summary', 'description', 'gmNotes'] as const) t[field] = `THEME_PRIVATE_${field}`;
  t.tags = ['THEME_PRIVATE_TAG'];
  t.pieceSelection = { mode: 'explicit', includePieceIds: ['THEME_PRIVATE_PIECE'], excludePieceIds: ['THEME_PRIVATE_EXCLUDE'], tags: { allOf: ['THEME_PRIVATE_ALL'], anyOf: ['THEME_PRIVATE_ANY'], noneOf: ['THEME_PRIVATE_NONE'] } };
  for (const kind of CONTENT_KINDS) t.contentSelection[kind] = { mode: 'explicit', includeContentIds: [contentFixture(kind).id], excludeContentIds: [`THEME_PRIVATE_${kind}`], tags: { allOf: ['THEME_PRIVATE_ALL'], anyOf: ['THEME_PRIVATE_ANY'], noneOf: ['THEME_PRIVATE_NONE'] } };
  return t;
}
