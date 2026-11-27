import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentDefinition, ContentDraft, ContentKind } from '../../model/content';
import { duplicateContent, newContent, CONTENT_LIMITS } from '../../model/content';
import { toContentForm, fromContentForm } from '../../content/contentForm';
import type { ContentForm } from '../../content/contentForm';
import { CONTENT_CHANNEL, CONTENT_LIBRARY_UPDATED } from '../../content/contentEvents';
import { parseContentJson } from '../../content/contentJson';
import { contentRepository } from '../../repository/contentRepository';
import type { ContentRepository, ContentCollisionPolicy } from '../../repository/contentRepository';

function editing(value: ContentDefinition | ContentDraft, baseline: ContentDefinition | null = null, dirty = false) {
  const form = toContentForm(value);
  return { form, baseline, clean: dirty ? '' : JSON.stringify(form) };
}
const message = (error: unknown) => error instanceof Error ? error.message : 'コンテンツ操作に失敗しました。';

export function useContentEditor(repository: ContentRepository = contentRepository) {
  const [entry, setEntry] = useState(() => editing(newContent()));
  const current = useRef(entry); current.current = entry;
  const open = (next: typeof entry) => { current.current = next; setEntry(next); };
  const [items, setItems] = useState<ContentDefinition[]>([]);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<(() => void | Promise<void>) | null>(null);
  const [incoming, setIncoming] = useState<ContentDefinition[] | null>(null);
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
        setEntry(latest ? editing(latest, latest) : editing(newContent()));
        setNotice(latest ? '別ウィンドウの更新を読み込みました。' : 'このコンテンツは別ウィンドウで削除されました。');
      }
    }
  }, [repository]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void reload().catch(e => { if (mounted.current) setError(message(e)); }); };
    refresh();
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CONTENT_CHANNEL);
    if (channel) channel.onmessage = event => { if (event.data?.type === CONTENT_LIBRARY_UPDATED) refresh(); };
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
    const saved = await repository.save(fromContentForm(state.form), state.baseline?.updatedAt ?? null);
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
    patch: (patch: Partial<ContentForm>) => setEntry(value => ({ ...value, form: { ...value.form, ...patch } })),
    patchContent: (patch: Partial<ContentDraft>) => setEntry(value => ({ ...value, form: { ...value.form, content: { ...value.form.content, ...patch } } })),
    request, save, execute,
    retry: () => execute(() => reload()),
    create: (kind: ContentKind) => request(() => { open(editing(newContent(kind))); setNotice(''); }),
    select: (id: string) => request(async () => {
      const value = await repository.get(id);
      if (!value) throw new Error('コンテンツが削除されています。一覧を再取得してください。');
      open(editing(value, value)); setNotice('');
    }),
    duplicate: () => request(() => { open(editing(duplicateContent(fromContentForm(current.current.form)), null, true)); setNotice('複製を作成しました。保存するとライブラリへ登録します。'); }),
    resolvePending: async (choice: 'save' | 'discard' | 'cancel') => {
      const action = pending;
      if (!action || busyRef.current) return;
      if (choice === 'cancel') { setPending(null); return; }
      if (choice === 'save' && !await save()) return;
      if (choice === 'discard') {
        const state = current.current;
        open(state.baseline ? editing(state.baseline, state.baseline) : editing(newContent()));
      }
      setPending(null); await execute(action);
    },
    deleteCurrent: () => execute(async () => {
      const value = current.current.baseline;
      if (!value) return;
      await repository.delete(value.id, value.updatedAt);
      setDeleting(false); open(editing(newContent())); setNotice('削除しました。');
      try { await reload(false); } catch (e) { setError(`削除済みですが一覧の取得に失敗しました。${message(e)}`); }
    }),
    readImport: (file: File) => execute(async () => {
      if (file.size > CONTENT_LIMITS.importBytes) throw new Error('Importファイルは10 MiBまでです。');
      setIncoming(parseContentJson(await file.text()));
    }),
    importContents: (policy: ContentCollisionPolicy) => execute(async () => {
      if (!incoming) return;
      const report = await repository.saveMany(incoming, policy);
      setIncoming(null);
      setNotice(`Import完了：新規登録 ${report.added}件 / 再利用 ${report.reused}件 / スキップ ${report.skipped}件 / 新規ID発行 ${report.reidentified}件`);
      // Import may update the library but never silently replaces an open draft.
      try { await reload(false); } catch (e) { setError(`Import済みですが一覧の取得に失敗しました。${message(e)}`); }
    }),
  };
}
