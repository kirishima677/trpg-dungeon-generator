import { useMemo } from 'react';
import type { preparePieceSheet } from '../../publishing/publicationSession';

type PreparedPieceSheet = ReturnType<typeof preparePieceSheet>;
const message = (error: unknown) => error instanceof Error ? error.message : '印刷シートを生成できません。';

/** Page navigation regenerates only its preview; full export HTML belongs to the prepared layout. */
export function usePieceSheetPreview(sheet: PreparedPieceSheet | null, pageIndex: number) {
  const document = useMemo(() => {
    try {
      return { html: sheet?.layout.pages.length && !sheet.issues.length ? sheet.html() : '', error: '' };
    } catch (e) { return { html: '', error: message(e) }; }
  }, [sheet]);
  const preview = useMemo(() => {
    try {
      return { html: sheet?.layout.pages.length && !document.error ? sheet.html(pageIndex) : '', error: '' };
    } catch (e) { return { html: '', error: message(e) }; }
  }, [sheet, pageIndex, document.error]);
  // Preview validation still blocks export if it detects an invalid layout.
  return { html: preview.error ? '' : document.html, preview: preview.html, error: document.error || preview.error };
}
