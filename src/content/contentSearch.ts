import type { ContentDefinition, ContentKind } from '../model/content';

export function searchContents(contents: readonly ContentDefinition[], query: string, kind: ContentKind | '') {
  const term = query.trim().toLowerCase();
  return contents.filter(c => (!kind || c.kind === kind)
    && (!term || [c.name, c.summary, ...c.tags].some(value => value.toLowerCase().includes(term))));
}
