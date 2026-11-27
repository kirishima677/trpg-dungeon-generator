import type { DungeonTheme } from '../model/dungeonTheme';
export function searchThemes(values: readonly DungeonTheme[], query: string, genre = '', category = '') {
  const term = query.trim().toLowerCase();
  return values.filter(t => (!genre || t.genre === genre) && (!category || t.category === category)
    && (!term || [t.name, t.summary, t.genre, t.category, ...t.tags].some(v => v.toLowerCase().includes(term))));
}
