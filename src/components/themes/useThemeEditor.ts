import { useLibraryEditor } from '../library/useLibraryEditor';
import { newTheme, duplicateTheme, THEME_LIMITS } from '../../model/dungeonTheme';
import { fromThemeForm, toThemeForm } from '../../themes/themeForm';
import { parseThemeJson } from '../../themes/themeJson';
import { THEME_CHANNEL, THEME_LIBRARY_UPDATED } from '../../themes/themeEvents';
import { themeRepository } from '../../repository/themeRepository';
import type { ThemeRepository } from '../../repository/themeRepository';

const config = { newDraft: newTheme, toForm: toThemeForm, fromForm: fromThemeForm, duplicate: duplicateTheme, parse: parseThemeJson,
  importBytes: THEME_LIMITS.importBytes, channel: THEME_CHANNEL, event: THEME_LIBRARY_UPDATED };
export function useThemeEditor(repository: ThemeRepository = themeRepository) {
  return useLibraryEditor(repository, config);
}
