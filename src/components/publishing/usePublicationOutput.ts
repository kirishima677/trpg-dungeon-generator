import { useEffect, useMemo, useState } from 'react';
import type { DungeonDocument } from '../../model/types';
import type { PublicationSettings } from './usePublicationSettings';
import type { PublicationSession } from '../../publishing/publicationSession';
import { publicationErrorMessage } from '../../publishing/publicationIssues';
import { validatePngDimensions } from '../../publishing/exporters';

export function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
const attempt = <T,>(build: () => T) => {
  try { return { value: build(), error: '' }; } catch (e) { return { value: null as T | null, error: publicationErrorMessage(e) }; }
};
/** Adapts the shared service to the currently visible preview; it owns no business generation logic. */
export function usePublicationOutput(snapshot: DungeonDocument | null, session: PublicationSession, settings: PublicationSettings) {
  const { view, profile, guideOptions, printProfile, printPage } = settings;
  const guideView = view === 'guide' || (view === 'print' && printProfile.target === 'scenario-guide');
  const active = Boolean(snapshot && view !== 'pieces' && view !== 'package');
  const geometry = useMemo(() => attempt(() => active && (!guideView || guideOptions.includeMap) ? session.geometry(profile.audience) : null),
    [active, guideView, guideOptions.includeMap, session, profile.audience]);
  const guide = useMemo(() => attempt(() => active && guideView ? session.guide(profile, guideOptions) : null), [active, guideView, session, profile, guideOptions]);
  const output = useMemo(() => attempt(() => active ? guideView ? guide.value?.map ?? null : session.map(profile) : null), [active, guideView, guide.value, session, profile]);
  const printDocument = useMemo(() => attempt(() => {
    if (!active || view !== 'print') return null;
    return printProfile.target === 'scenario-guide' ? { html: session.guidePrint(profile, guideOptions, printProfile), layout: null }
      : session.mapPrint(profile, printProfile);
  }), [active, view, session, profile, guideOptions, printProfile]);
  const pageIndex = Math.min(printPage, (printDocument.value?.layout?.pages.length ?? 1) - 1);
  const printPreviewHtml = useMemo(() => printDocument.value?.layout ? session.mapPrint(profile, printProfile, snapshot?.name, pageIndex).html
    : printDocument.value?.html ?? '', [printDocument.value, session, profile, printProfile, snapshot?.name, pageIndex]);
  const svgBlob = useMemo(() => output.value ? new Blob([output.value.svg], { type: 'image/svg+xml;charset=utf-8' }) : null, [output.value]);
  const svgUrl = useBlobUrl(svgBlob);
  let pngError = '';
  if (output.value) { try { validatePngDimensions(output.value.width, output.value.height); } catch (e) { pngError = publicationErrorMessage(e); } }
  return { guideView, guide, geometry, output, printDocument, printPreviewHtml, pageIndex, svgBlob, svgUrl, pngError,
    issues: geometry.value ? session.mapIssues(profile.audience) : [],
    unresolved: geometry.value?.unresolvedCount ?? 0, error: geometry.error || output.error || guide.error || printDocument.error };
}
