import { useEffect, useMemo } from 'react';
import { createPublicationSession } from '../../publishing/publicationSession';
import { exportFilename } from '../../publishing/exporters';
import { needsAcknowledgement } from '../../publishing/publicationIssues';
import { usePublicationSettings } from './usePublicationSettings';
import { usePublicationSnapshot } from './usePublicationSnapshot';
import { useBlobUrl, usePublicationOutput } from './usePublicationOutput';
import { usePublicationActions } from './usePublicationActions';
import type { PublicationRuntime } from './usePublicationActions';

const defaultRuntime: PublicationRuntime = {};
/** Coordinates settings, snapshot, previews and actions; the view contains only presentation. */
export function usePublicationController(runtime: PublicationRuntime = defaultRuntime) {
  const settings = usePublicationSettings();
  const captured = usePublicationSnapshot(settings.refresh), { snapshot } = captured;
  const session = useMemo(() => createPublicationSession(snapshot), [snapshot]);
  const output = usePublicationOutput(snapshot, session, settings);
  const actions = usePublicationActions(captured.revision, runtime);
  useEffect(() => { actions.reset(); }, [snapshot, actions.reset]);
  const pngUrl = useBlobUrl(actions.png);
  const update = (patch: Parameters<typeof settings.updateProfile>[0]) => { settings.updateProfile(patch); actions.reset(); };
  const blocked = needsAcknowledgement(output.issues) && !settings.allowUnresolved;
  const disabled = actions.busy || (settings.view === 'print' ? !output.printDocument.value : settings.view === 'guide' ? !output.guide.value : !output.output.value) || blocked;
  const exportMap = async (format: 'svg' | 'png' | 'html' | 'print-html') => {
    if (!snapshot || disabled) return;
    const { profile, printProfile } = settings;
    await actions.run(async () => {
      if (format === 'print-html') return new Blob([output.printDocument.value!.html], { type: 'text/html;charset=utf-8' });
      if (format === 'html') return new Blob([output.guide.value!.html], { type: 'text/html;charset=utf-8' });
      if (format === 'svg') return output.svgBlob!;
      return actions.makePng(output.output.value!.svg, output.output.value!.width, output.output.value!.height, profile.background);
    }, blob => {
      const filename = format === 'print-html' ? exportFilename(snapshot.name, profile.audience, 'svg').replace(/\.svg$/, `-${printProfile.target}-print.html`)
        : exportFilename(snapshot.name, profile.audience, format);
      actions.download(blob, filename); if (format === 'png') actions.setPng(blob); actions.setNotice(`${format.toUpperCase()}を書き出しました。`);
    });
  };
  const startPrint = async () => {
    if (!output.printDocument.value || disabled) return;
    await actions.run(() => actions.printer.print(output.printDocument.value!.html), () => {
      actions.setNotice('印刷画面の処理を終了しました。PDF保存・印刷・キャンセルはいずれも正常な操作です。');
    }, false);
  };
  const exportPieceSheets = async (html: string, print: boolean) => {
    if (!html) return;
    await actions.run(async () => { if (print) await actions.printer.print(html); }, () => {
      if (!print) actions.download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'piece-sheets.html');
      actions.setNotice(print ? '印刷画面の処理を終了しました。' : 'ピース印刷用HTMLを書き出しました。');
    }, !print);
  };
  return { ...settings, ...actions, ...output, session, snapshot, update, exportMap, startPrint, exportPieceSheets, pngUrl, disabled,
    error: actions.error || captured.error, generationError: output.error };
}
export type PublicationController = ReturnType<typeof usePublicationController>;
