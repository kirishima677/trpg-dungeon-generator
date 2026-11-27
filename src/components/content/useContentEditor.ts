import { useLibraryEditor } from '../library/useLibraryEditor';
import type { ContentDraft, ContentKind } from '../../model/content';
import { duplicateContent, newContent, CONTENT_LIMITS } from '../../model/content';
import { toContentForm, fromContentForm } from '../../content/contentForm';
import type { ContentForm } from '../../content/contentForm';
import { CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED } from '../../content/contentEvents';
import { parseContentJson } from '../../content/contentJson';
import { contentRepository } from '../../repository/contentRepository';
import type { ContentRepository } from '../../repository/contentRepository';

const config = { newDraft: newContent, toForm: toContentForm, fromForm: fromContentForm, duplicate: duplicateContent,
  parse: parseContentJson, importBytes: CONTENT_LIMITS.importBytes, channel: CONTENT_CHANNEL, event: CONTENT_LIBRARY_UPDATED };
export function useContentEditor(repository: ContentRepository = contentRepository) {
  const editor = useLibraryEditor(repository, config);
  return { ...editor, importContents: editor.importItems, create: (kind: ContentKind) => editor.create(() => newContent(kind)),
    patch: (patch: Partial<ContentForm>) => editor.changeForm(form => ({ ...form, ...patch })),
    patchContent: (patch: Partial<ContentDraft>) => editor.changeForm(form => ({ ...form, content: { ...form.content, ...patch } })),
  };
}
