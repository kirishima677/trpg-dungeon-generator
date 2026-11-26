import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { downloadBlob, svgToPng } from '../../publishing/exporters';
import { createBrowserPrintAdapter } from '../../publishing/print/browserPrint';
import { publicationErrorMessage } from '../../publishing/publicationIssues';

export interface PublicationRuntime {
  png?: typeof svgToPng; download?: typeof downloadBlob; createPrinter?: typeof createBrowserPrintAdapter;
}
/** Owns asynchronous side effects, stale-result protection and the print-window lifetime. */
export function usePublicationActions(revision: RefObject<number>, runtime: PublicationRuntime) {
  const [busy, setBusyState] = useState(false), running = useRef(false), mounted = useRef(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [png, setPng] = useState<Blob | null>(null);
  const printer = useMemo(() => (runtime.createPrinter ?? createBrowserPrintAdapter)(), [runtime.createPrinter]);
  useEffect(() => {
    mounted.current = true; window.addEventListener('pagehide', printer.close);
    return () => { mounted.current = false; window.removeEventListener('pagehide', printer.close); printer.close(); };
  }, [printer]);
  const setBusy = (value: boolean) => { running.current = value; setBusyState(value); };
  const reset = useCallback(() => { setError(''); setNotice(''); setPng(null); }, []);
  async function run<T>(generate: () => Promise<T>, commit: (value: T) => void, discardStale = true) {
    if (running.current) return;
    const stamp = revision.current; setBusy(true); setError(''); setNotice('');
    const valid = () => mounted.current && (!discardStale || stamp === revision.current);
    try { const value = await generate(); if (valid()) commit(value); }
    catch (e) { if (valid()) setError(publicationErrorMessage(e)); }
    finally { running.current = false; if (mounted.current) setBusyState(false); }
  }
  return { busy, error, notice, png, printer, run, reset, setBusy, setError, setNotice, setPng,
    makePng: runtime.png ?? svgToPng, download: runtime.download ?? downloadBlob };
}
