import { useCallback, useEffect, useRef, useState } from 'react';

interface Stamp { id: string; updatedAt: string }
export interface LibraryEditorRepository<T, D> {
  list(): Promise<T[]>; get(id: string): Promise<T | undefined>;
  save(draft: D, revision: string | null): Promise<T>; delete(id: string, revision: string): Promise<void>;
  saveMany(values: T[], policy: 'skip' | 'new-id'): Promise<{ added: number; reused: number; skipped: number; reidentified: number }>;
}
export interface LibraryEditorConfig<T, D, F> {
  newDraft: () => D; toForm: (value: T | D) => F; fromForm: (form: F) => D; duplicate: (value: D) => D;
  parse: (text: string) => T[]; importBytes: number; channel: string; event: string;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'ライブラリ操作に失敗しました。';

/** Shared editing workflow; domain validation, JSON, models and persistence stay with each library. */
export function useLibraryEditor<D extends { id: string }, T extends D & Stamp, F>(repository: LibraryEditorRepository<T, D>, config: LibraryEditorConfig<T, D, F>) {
  function editing(value: T | D, baseline: T | null = null, dirty = false) {
    const form = config.toForm(value);
    return { form, baseline, clean: dirty ? '' : JSON.stringify(form) };
  }
  const [entry, setEntry] = useState(() => editing(config.newDraft()));
  const current = useRef(entry); current.current = entry;
  const open = (next: typeof entry) => { current.current = next; setEntry(next); };
  const [items, setItems] = useState<T[]>([]);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<(() => void | Promise<void>) | null>(null);
  const [incoming, setIncoming] = useState<T[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const generation = useRef(0), mounted = useRef(true);
  const dirty = JSON.stringify(entry.form) !== entry.clean;

  const reload = useCallback(async (external = true) => {
    const version = ++generation.current;
    const values = await repository.list();
    if (!mounted.current || version !== generation.current) return;
    setItems(values); setReady(true);
    if (external) {
      const state = current.current, baseline = state.baseline;
      if (!baseline) return;
      const latest = values.find(c => c.id === baseline.id);
      if (latest?.updatedAt === baseline.updatedAt) return;
      if (JSON.stringify(state.form) !== state.clean || busyRef.current) {
        setNotice('別ウィンドウで更新または削除されました。未保存の編集は保持しています。保存前に一覧から開き直して確認してください。');
      } else {
        setEntry(latest ? editing(latest, latest) : editing(config.newDraft()));
        setNotice(latest ? '別ウィンドウの更新を読み込みました。' : 'この項目は別ウィンドウで削除されました。');
      }
    }
  }, [repository, config]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void reload().catch(e => { if (mounted.current) setError(message(e)); }); };
    refresh();
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(config.channel); channel.onmessage = event => { if (event.data?.type === config.event) refresh(); }; } catch { /* Focus refresh remains available. */ }
    window.addEventListener('focus', refresh);
    return () => { mounted.current = false; generation.current++; channel?.close(); window.removeEventListener('focus', refresh); };
  }, [reload]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (dirty || busy) window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);

  const execute = async (action: () => void | Promise<void>) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (e) { setError(message(e)); return false; }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const save = () => execute(async () => {
    const state = current.current;
    const saved = await repository.save(config.fromForm(state.form), state.baseline?.updatedAt ?? null);
    open(editing(saved, saved)); setNotice('保存しました。');
    // Persisted success must not be reported as a failed save if refreshing the list fails.
    try { await reload(false); } catch (e) { setError(`保存済みですが一覧の取得に失敗しました。${message(e)}`); }
  });
  const request = (action: () => void | Promise<void>) => {
    if (busyRef.current) return;
    if (JSON.stringify(current.current.form) !== current.current.clean) setPending(() => action);
    else void execute(action);
  };
  return { entry, items, busy, dirty, ready, error, notice, pending, incoming, deleting, setDeleting, setIncoming,
    changeForm: (update: (form: F) => F) => setEntry(value => ({ ...value, form: update(value.form) })),
    request, save, execute,
    retry: () => execute(() => reload()),
    create: (make: () => D = config.newDraft) => request(() => { open(editing(make())); setNotice(''); }),
    select: (id: string) => request(async () => {
      const value = await repository.get(id);
      if (!value) throw new Error('ライブラリの項目が削除されています。一覧を再取得してください。');
      open(editing(value, value)); setNotice('');
    }),
    duplicate: () => request(() => { open(editing(config.duplicate(config.fromForm(current.current.form)), null, true)); setNotice('複製を作成しました。保存するとライブラリへ登録します。'); }),
    resolvePending: async (choice: 'save' | 'discard' | 'cancel') => {
      const action = pending;
      if (!action || busyRef.current) return;
      if (choice === 'cancel') { setPending(null); return; }
      if (choice === 'save' && !await save()) return;
      if (choice === 'discard') {
        const state = current.current;
        open(state.baseline ? editing(state.baseline, state.baseline) : editing(config.newDraft()));
      }
      setPending(null); await execute(action);
    },
    deleteCurrent: () => execute(async () => {
      const value = current.current.baseline;
      if (!value) return;
      await repository.delete(value.id, value.updatedAt);
      setDeleting(false); open(editing(config.newDraft())); setNotice('削除しました。');
      try { await reload(false); } catch (e) { setError(`削除済みですが一覧の取得に失敗しました。${message(e)}`); }
    }),
    readImport: (file: File) => execute(async () => {
      if (file.size > config.importBytes) throw new Error('Importファイルは10 MiBまでです。');
      setIncoming(config.parse(await file.text()));
    }),
    importItems: (policy: 'skip' | 'new-id') => execute(async () => {
      if (!incoming) return;
      const report = await repository.saveMany(incoming, policy);
      setIncoming(null);
      setNotice(`Import完了：新規登録 ${report.added}件 / 再利用 ${report.reused}件 / スキップ ${report.skipped}件 / 新規ID発行 ${report.reidentified}件`);
      // Import may update the library but never silently replaces an open draft.
      try { await reload(false); } catch (e) { setError(`Import済みですが一覧の取得に失敗しました。${message(e)}`); }
    }),
  };
}

export type LibraryEditorState<D extends { id: string }, T extends D & Stamp, F> = ReturnType<typeof useLibraryEditor<D,T,F>>;
