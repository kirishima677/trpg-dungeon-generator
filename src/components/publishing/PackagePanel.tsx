import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DungeonDocument } from '../../model/types';
import type { PackageSettings } from '../../publishing/package/artifactGenerator';
import { ARTIFACT_LABELS, buildPackagePlan, defaultPackageProfile, packageFilename } from '../../publishing/package/packagePlan';
import type { PackageKind, PackagePlan, PackageProfile } from '../../publishing/package/packagePlan';
import { createPackageBuilder } from '../../publishing/package/buildPackage';
import type { PackageBuildProgress, PackageBuildResult } from '../../publishing/package/buildPackage';
import { downloadBlob } from '../../publishing/exporters';

const errorText = (e: unknown) => e instanceof Error ? e.message : 'パッケージを生成できません。';
const phaseLabels = { preparing: '準備中', generating: '成果物を生成中', validating: '収録内容を検証中', compressing: 'ZIPを圧縮中', completed: '生成完了' };
export function PackagePanel({ snapshot, settings, onBusy, profile, onProfile }: { profile: PackageProfile; onProfile: Dispatch<SetStateAction<PackageProfile>>; snapshot: DungeonDocument | null; settings: PackageSettings; onBusy: (busy: boolean) => void }) {
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [progress, setProgress] = useState<PackageBuildProgress | null>(null), [result, setResult] = useState<PackageBuildResult | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [activePlan, setActivePlan] = useState<PackagePlan | null>(null);
  const builder = useMemo(() => createPackageBuilder(), []), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { setAllowIncomplete(false); }, [snapshot]);
  useEffect(() => {
    mounted.current = true;
    const cancel = () => controller.current?.abort();
    window.addEventListener('pagehide', cancel);
    return () => { mounted.current = false; window.removeEventListener('pagehide', cancel); cancel(); };
  }, []);
  const plan = useMemo(() => {
    try { return { value: snapshot ? buildPackagePlan(profile, snapshot) : null, filename: packageFilename(profile), error: '' }; }
    catch (e) { return { value: null, filename: '', error: errorText(e) }; }
  }, [snapshot, profile]);
  const start = async () => {
    if (controller.current || !snapshot || !plan.value) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); onBusy(true);
    setActivePlan(plan.value); setError(''); setNotice(''); setResult(null); setProgress(null);
    try {
      const value = await builder.build(snapshot, profile, settings, { signal: abort.signal, allowIncomplete,
        onProgress: p => { if (mounted.current) setProgress(p); } });
      if (!mounted.current || abort.signal.aborted) return;
      downloadBlob(value.blob, value.filename); setResult(value);
      setNotice('ZIPを生成し、ブラウザへダウンロードを要求しました。保存先・保存完了はブラウザで確認してください。');
    } catch (e) {
      if (mounted.current) {
        if (e instanceof Error && e.name === 'AbortError') setNotice('生成をキャンセルしました。ZIPのダウンロードは行っていません。');
        else setError(errorText(e));
      }
    } finally {
      controller.current = null;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  };
  const updateProfile = (value: SetStateAction<PackageProfile>) => { onProfile(value); setResult(null); setProgress(null); setError(''); setNotice(''); };
  const displayed = busy ? activePlan : plan.value;
  return <section className="package-panel" aria-label="一括出版">
    <div className="publish-layout"><aside><fieldset disabled={busy}><legend>出版パッケージ</legend>
      <label>パッケージ種別<select value={profile.kind} onChange={e => { updateProfile(p => ({ ...defaultPackageProfile(e.target.value as PackageKind), title: p.title })); setAllowIncomplete(false); setError(''); setResult(null); }}>
        <option value="player">プレイヤー用</option><option value="gm">GM用</option><option value="complete">完全版</option></select></label>
      <label>公開タイトル<input type="text" maxLength={200} value={profile.title} onChange={e => updateProfile(p => ({ ...p, title: e.target.value }))} /></label>
      <p className="publish-help">ZIP名・ガイド・印刷文書・README・manifestに使用します。部屋名称はプレイヤー用成果物へ収録しません。</p>
      {Object.entries(ARTIFACT_LABELS).map(([kind, label]) => {
        const k = kind as keyof typeof ARTIFACT_LABELS, project = k === 'project-json' || k === 'piece-library-json';
        return <label className="publish-checkbox" key={k}><input type="checkbox" disabled={(profile.kind === 'player' && project) || (profile.kind === 'complete' && k === 'project-json')}
          checked={profile.artifacts.includes(k)} onChange={e => updateProfile(p => ({ ...p, artifacts: e.target.checked ? [...p.artifacts, k] : p.artifacts.filter(v => v !== k) }))} />{label}{profile.kind === 'complete' && k === 'project-json' ? '（必須）' : ''}</label>;
      })}
      {profile.kind !== 'player' && <label className="publish-checkbox"><input type="checkbox" checked={profile.includePlayerArtifacts} onChange={e => updateProfile(p => ({ ...p, includePlayerArtifacts: e.target.checked }))} />プレイヤー用成果物も収録</label>}
      <label className="publish-checkbox"><input type="checkbox" checked={profile.includeReadme} onChange={e => updateProfile(p => ({ ...p, includeReadme: e.target.checked }))} />README.txt</label>
      <p>manifest.jsonは必ず収録します。</p>
      <label className="publish-checkbox"><input type="checkbox" checked={allowIncomplete} onChange={e => setAllowIncomplete(e.target.checked)} />未解決の経路・未対応素材の警告を確認して収録する</label>
    </fieldset>
    {profile.kind !== 'player' && <p role="alert" className="publish-warning">GM専用情報・制作データを含みます。パッケージ全体をプレイヤーへ配布しないでください。</p>}
    <p className="publish-help">マップ・ガイド・印刷・ピース印刷タブの設定を引き継ぎます。生成中は開始時点のデータと設定を保持します。PDF本体は収録せず、印刷用HTMLを収録します。</p>
    <p>マップ: {settings.publish.pixelsPerCell}px / マス · {settings.publish.showGrid ? 'グリッドあり' : 'グリッドなし'}<br />
      印刷: {settings.print.paperSize} / {settings.print.orientation === 'portrait' ? '縦' : '横'} / {settings.print.map.cellSizeMm}mm<br />
      ピース: {settings.pieces.options.source === 'dungeon' ? 'ダンジョン使用ピース' : settings.pieces.options.source === 'library' ? 'ライブラリ' : '通路素材'}・指定数量を使用</p>
    {(error || plan.error) && <p role="alert" className="publish-error">{error || plan.error}</p>}
    <div className="publish-actions"><button disabled={busy || !plan.value} onClick={() => void start()}>ZIP生成・ダウンロード</button>
      {busy && <button disabled={controller.current?.signal.aborted} onClick={() => { controller.current?.abort(); setNotice('キャンセルしています。実行中の成果物処理が終わるまで待機する場合があります。'); }}>キャンセル</button>}</div>
    <p role="status">{notice}</p>
    </aside><div>
      <h2>収録予定のファイル</h2><p>{busy ? '生成開始時点の収録計画' : plan.filename}</p>
      <p>予定ファイル数: {displayed?.artifacts.length ?? 0} · 圧縮前サイズは生成後に確定します。</p>
      <ul className="package-file-list">{displayed?.artifacts.map(r => <li key={r.path}><code>{r.path}</code><span>{r.audience === 'package' ? 'パッケージ情報' : r.audience === 'project' ? '制作データ' : r.audience === 'gm' ? 'GM用' : 'プレイヤー用'}</span></li>)}</ul>
      {progress && (busy || result) && <section aria-label="出版処理の進捗"><h2>{phaseLabels[progress.phase]}</h2>
        {busy && progress.phase === 'compressing' ? <progress aria-label="ZIP圧縮" /> : <progress aria-label="成果物の生成" value={progress.completedArtifacts} max={progress.totalArtifacts} />}
        <p>{progress.completedArtifacts} / {progress.totalArtifacts}ファイル{progress.currentArtifact ? ` · ${progress.currentArtifact}` : ''}</p></section>}
      {result && <section aria-label="パッケージ生成結果"><h2>出版パッケージ生成完了</h2><p>{result.filename}</p>
        <p>収録ファイル: {result.fileCount} · ZIPサイズ: {(result.blob.size / 1024 / 1024).toFixed(2)} MiB · 圧縮前: {(result.uncompressedBytes / 1024 / 1024).toFixed(2)} MiB</p>
        {result.warnings.map(w => <p className="publish-warning" key={w}>{w}</p>)}
        <button onClick={() => downloadBlob(result.blob, result.filename)}>同じZIPを再ダウンロード</button></section>}
    </div></div>
  </section>;
}
