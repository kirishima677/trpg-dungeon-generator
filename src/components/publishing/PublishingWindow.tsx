import { useEffect, useMemo, useRef, useState } from 'react';
import type { DungeonDocument } from '../../model/types';
import { buildPublishDocument } from '../../publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../../publishing/publishMapGeometry';
import type { PublishMapGeometry } from '../../publishing/publishMapGeometry';
import { defaultPublishProfile, MAX_PADDING_CELLS, MAX_PIXELS_PER_CELL } from '../../publishing/publishProfile';
import type { PublishProfile } from '../../publishing/publishProfile';
import { renderPublishSvg } from '../../publishing/PublishMapRenderer';
import { downloadBlob, exportFilename, svgToPng, validatePngDimensions } from '../../publishing/exporters';
import { isPublishSnapshot, snapshotChannelName } from '../../publishing/snapshotChannel';
import './publishing.css';

function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const next = URL.createObjectURL(blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
const message = (e: unknown) => e instanceof Error ? e.message : 'マップの生成に失敗しました。';

export function PublishingWindow() {
  const [snapshot, setSnapshot] = useState<DungeonDocument | null>(null);
  const [profile, setProfile] = useState(defaultPublishProfile);
  const [preset, setPreset] = useState('64');
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), exporting = useRef(false);
  const [allowUnresolved, setAllowUnresolved] = useState(false);
  const [notice, setNotice] = useState('');
  const [png, setPng] = useState<Blob | null>(null);
  const mounted = useRef(true);
  const snapshotRevision = useRef(0);
  const pngUrl = useBlobUrl(png);

  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('source') ?? '', dungeonId = params.get('dungeonId') ?? '';
    const channel = new BroadcastChannel(snapshotChannelName(token));
    const timeout = setTimeout(() => setError('編集画面からデータを取得できません。元の編集画面で「出版」を押して開き直してください。'), 5000);
    channel.onmessage = event => {
      if (!isPublishSnapshot(event.data, token, dungeonId)) return;
      snapshotRevision.current++;
      clearTimeout(timeout); setSnapshot(event.data.document); setError(''); setNotice(''); setAllowUnresolved(false); setPng(null);
    };
    channel.postMessage({ type: 'request', token, dungeonId });
    return () => { mounted.current = false; clearTimeout(timeout); channel.close(); };
  }, []);

  // A snapshot and audience identify the routing input. Visual controls never re-route.
  const resolve = useMemo(() => {
    const cache = new Map<string, PublishMapGeometry>();
    return (audience: PublishProfile['audience']) => {
      if (!snapshot) return null;
      if (!cache.has(audience)) cache.set(audience, buildPublishMapGeometry(buildPublishDocument(snapshot, audience)));
      return cache.get(audience)!;
    };
  }, [snapshot]);
  const geometry = useMemo(() => {
    try { return { value: resolve(profile.audience), error: '' }; }
    catch (e) { return { value: null, error: message(e) }; }
  }, [resolve, profile.audience]);
  const output = useMemo(() => {
    try { return { value: geometry.value ? renderPublishSvg(geometry.value, profile) : null, error: '' }; }
    catch (e) { return { value: null, error: message(e) }; }
  }, [geometry.value, profile]);
  const svgBlob = useMemo(() => output.value ? new Blob([output.value.svg], { type: 'image/svg+xml;charset=utf-8' }) : null, [output.value]);
  const svgUrl = useBlobUrl(svgBlob);
  const unresolved = geometry.value?.unresolvedCount ?? 0;
  let pngError = '';
  if (output.value) { try { validatePngDimensions(output.value.width, output.value.height); } catch (e) { pngError = message(e); } }
  const update = (patch: Partial<PublishProfile>) => {
    setProfile(p => ({ ...p, ...patch })); setNotice(''); setPng(null); setError('');
    if (patch.audience) setAllowUnresolved(false);
  };
  const exportMap = async (format: 'svg' | 'png') => {
    if (exporting.current || !output.value || !snapshot || (unresolved && !allowUnresolved)) return;
    exporting.current = true; setBusy(true); setError(''); setNotice('');
    const revision = snapshotRevision.current;
    try {
      const blob = format === 'svg' ? svgBlob! : await svgToPng(output.value.svg, output.value.width, output.value.height, profile.background);
      if (!mounted.current || revision !== snapshotRevision.current) return;
      downloadBlob(blob, exportFilename(snapshot.name, profile.audience, format));
      if (format === 'png') setPng(blob);
      setNotice(`${format.toUpperCase()}を書き出しました。`);
    } catch (e) { if (mounted.current) setError(message(e)); }
    finally { exporting.current = false; if (mounted.current) setBusy(false); }
  };
  const disabled = busy || !output.value || Boolean(unresolved && !allowUnresolved);
  return <main className="publishing">
    <header><h1>出版 / マップ出力</h1><p>{snapshot?.name ?? '読み込み中…'}</p>
      <p>開いた時点の編集内容を使用します。最新の状態は編集画面の「出版」から取り込めます。</p></header>
    <div className="publish-layout">
      <aside><fieldset disabled={busy}><legend>出力設定</legend>
        <label>対象<select value={profile.audience} onChange={e => {
          const audience = e.target.value as PublishProfile['audience'], defaults = defaultPublishProfile(audience);
          update({ audience, showRoomNumbers: defaults.showRoomNumbers, showRoomNames: defaults.showRoomNames });
        }}><option value="player">プレイヤー用</option><option value="gm">GM用</option></select></label>
        {([['showGrid', 'グリッド'], ['showRoomNumbers', '部屋番号'], ['showRoomNames', '部屋名称']] as const).map(([key, label]) =>
          <label className="publish-checkbox" key={key}><input type="checkbox" checked={profile[key]} onChange={e => update({ [key]: e.target.checked })} />{label}</label>)}
        <label>背景<select value={profile.background} onChange={e => update({ background: e.target.value as PublishProfile['background'] })}>
          <option value="white">白色</option><option value="transparent">透明</option></select></label>
        <label>解像度プリセット<select value={preset}
          onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') update({ pixelsPerCell: Number(e.target.value) }); }}>
          <option value="32">低解像度 32px</option><option value="64">標準 64px</option><option value="128">高解像度 128px</option><option value="custom">カスタム</option></select></label>
        <label>1マスのピクセル数<input type="number" min={1} max={MAX_PIXELS_PER_CELL} step={1} value={Number.isNaN(profile.pixelsPerCell) ? '' : profile.pixelsPerCell}
          onChange={e => { setPreset('custom'); update({ pixelsPerCell: e.target.valueAsNumber }); }} /></label>
        <label>余白（マス）<input type="number" min={0} max={MAX_PADDING_CELLS} step={0.5} value={Number.isNaN(profile.paddingCells) ? '' : profile.paddingCells}
          onChange={e => update({ paddingCells: e.target.valueAsNumber })} /></label>
      </fieldset>
      <p className="publish-help">プレイヤー用では隠し通路とGM専用情報を除外します。部屋自体はすべて表示されます。</p>
      {output.value && <p>出力サイズ: {output.value.width} × {output.value.height}px</p>}
      {unresolved > 0 && <div role="alert" className="publish-warning"><p>出力対象に未解決の接続が{unresolved}件あります。正常な通路としては描画しません。{profile.audience === 'gm' ? 'GM用には警告線を表示します。' : 'プレイヤー用には警告線を表示しません。'}</p>
        <label className="publish-checkbox"><input type="checkbox" disabled={busy} checked={allowUnresolved} onChange={e => setAllowUnresolved(e.target.checked)} />この状態で出力する</label></div>}
      {pngError && <p className="publish-warning">{pngError} SVGは出力できます。</p>}
      {(error || geometry.error || output.error) && <p role="alert" className="publish-error">{error || geometry.error || output.error}</p>}
      <div className="publish-actions"><button disabled={disabled} onClick={() => void exportMap('svg')}>SVG出力</button>
        <button disabled={disabled || Boolean(pngError)} onClick={() => void exportMap('png')}>{busy ? '処理中…' : 'PNG出力'}</button></div>
      <p role="status">{notice}</p>
      {svgUrl && <a href={svgUrl} target="_blank" rel="noopener">SVGを別タブで確認</a>}
      {pngUrl && <p><a href={pngUrl} target="_blank" rel="noopener">生成したPNGを確認</a></p>}
      </aside>
      <section aria-label="マッププレビュー" className="publish-preview"><label>プレビュー倍率 {zoom}%<input type="range" min={25} max={250} step={25} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <div className="publish-preview-scroll"><div style={{ width: `${zoom}%` }}>
          {svgUrl && <img src={svgUrl} alt="出版用マップ" style={{ width: '100%', height: 'auto', display: 'block' }} />}
        </div></div>
      </section>
    </div>
  </main>;
}
