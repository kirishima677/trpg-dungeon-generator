import { useLibraryEditor } from '../library/useLibraryEditor';
import { newRoomTheme, duplicateRoomTheme, ROOM_THEME_LIMITS } from '../../model/roomTheme';
import { fromRoomThemeForm, toRoomThemeForm } from '../../themes/roomThemeForm';
import { parseRoomThemeJson } from '../../themes/roomThemeJson';
import { ROOM_THEME_CHANNEL, ROOM_THEME_LIBRARY_UPDATED } from '../../themes/roomThemeEvents';
import { roomThemeRepository } from '../../repository/roomThemeRepository';
import type { RoomThemeRepository } from '../../repository/roomThemeRepository';

const config = { newDraft: newRoomTheme, toForm: toRoomThemeForm, fromForm: fromRoomThemeForm, duplicate: duplicateRoomTheme, parse: parseRoomThemeJson,
  importBytes: ROOM_THEME_LIMITS.importBytes, channel: ROOM_THEME_CHANNEL, event: ROOM_THEME_LIBRARY_UPDATED };
export function useRoomThemeEditor(repository: RoomThemeRepository = roomThemeRepository) {
  return useLibraryEditor(repository, config);
}
