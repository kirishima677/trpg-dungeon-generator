import type { DungeonTheme } from '../model/dungeonTheme';
export function searchThemes<T extends Pick<DungeonTheme,'name'|'summary'|'genre'|'category'|'tags'> & { purpose?: string }>(values: readonly T[], query: string, genre = '', category = '') {
  const term = query.trim().toLowerCase();
  return values.filter(t => (!genre || t.genre === genre) && (!category || t.category === category)
    && (!term || [t.name, t.summary, t.genre, t.category, t.purpose ?? '', ...t.tags].some(v => v.toLowerCase().includes(term))));
}
