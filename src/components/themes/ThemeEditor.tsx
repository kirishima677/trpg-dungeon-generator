import { useMemo } from 'react';
import { useThemeEditor } from './useThemeEditor';
import { useThemeMaterials } from './useThemeMaterials';
import type { ThemeMaterialRepositories } from './useThemeMaterials';
import type { ThemeRepository } from '../../repository/themeRepository';
import { fromThemeForm } from '../../themes/themeForm';
import { buildThemeExport, themeFilename } from '../../themes/themeJson';
import { downloadJson } from '../../utils/exportImport';
import { ThemeEditorWorkbench } from './ThemeEditorWorkbench';
import { DungeonRoomThemeSelection } from './DungeonRoomThemeSelection';

export function ThemeEditor({ repository, materials, download = downloadJson }: { repository?: ThemeRepository; materials?: ThemeMaterialRepositories; download?:typeof downloadJson }) {
  const editor = useThemeEditor(repository), library = useThemeMaterials(materials);
  const validError = useMemo(() => { try { fromThemeForm(editor.entry.form); return ''; } catch(e) { return (e as Error).message; } },[editor.entry.form]);
  return <ThemeEditorWorkbench editor={editor} library={library} title="Dungeon Theme管理" validError={validError} buildExport={buildThemeExport} filename={themeFilename} download={download}
    extraTabs={[{id:'room-themes',title:'Room Theme候補',content:<DungeonRoomThemeSelection policy={editor.entry.form.roomThemes} onChange={patch => editor.changeForm(f => ({ ...f,roomThemes:{...f.roomThemes,...patch} }))} /> }]} />;
}
