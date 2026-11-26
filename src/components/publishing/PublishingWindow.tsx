import { useEffect, useMemo, useRef, useState } from 'react';
import type { DungeonDocument } from '../../model/types';
import { buildPublishDocument, buildScenarioPublishDocument } from '../../publishing/publishDocumentBuilder';
import { buildPublishMapGeometry } from '../../publishing/publishMapGeometry';
import type { PublishMapGeometry } from '../../publishing/publishMapGeometry';
import { defaultPublishProfile, MAX_PADDING_CELLS, MAX_PIXELS_PER_CELL } from '../../publishing/publishProfile';
import type { PublishProfile } from '../../publishing/publishProfile';
import { renderPublishSvg } from '../../publishing/PublishMapRenderer';
import { downloadBlob, exportFilename, svgToPng, validatePngDimensions } from '../../publishing/exporters';
import { isPublishSnapshot, snapshotChannelName } from '../../publishing/snapshotChannel';
import { defaultScenarioGuideOptions, MAX_GUIDE_MAP_CELLS } from '../../publishing/scenario/scenarioGuide';
import { buildScenarioGuide, renderScenarioMap } from '../../publishing/scenario/scenarioGuideBuilder';
import { createScenarioHtmlRenderer } from '../../publishing/scenario/scenarioHtmlRenderer';
import { ScenarioGuideSettings } from './ScenarioGuideSettings';
import { ScenarioGuidePreview } from './ScenarioGuidePreview';
import { PrintSettings } from './PrintSettings';
import { PrintPreview } from './PrintPreview';
import { defaultPrintProfile, MAX_PRINT_MAP_CELLS } from '../../publishing/print/printProfile';
import { buildPrintLayout } from '../../publishing/print/printLayout';
import { BATTLE_PRINT_INSTRUCTIONS, renderMapPrintDocument, renderScenarioPrintDocument } from '../../publishing/print/printDocument';
import { createBrowserPrintAdapter } from '../../publishing/print/browserPrint';
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
  const [view, setView] = useState<'map' | 'guide' | 'print'>('map');
  const [printProfile, setPrintProfile] = useState(defaultPrintProfile);
  const [printPage, setPrintPage] = useState(0);
  const printer = useMemo(() => createBrowserPrintAdapter(), []);
  useEffect(() => {
    window.addEventListener('pagehide', printer.close);
    return () => { window.removeEventListener('pagehide', printer.close); printer.close(); };
  }, [printer]);
  const [guideOptions, setGuideOptions] = useState(() => defaultScenarioGuideOptions('player'));
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
  const guideView = view === 'guide' || (view === 'print' && printProfile.target === 'scenario-guide');
  const needsMap = !guideView || guideOptions.includeMap;
  const scenarioDocument = useMemo(() => {
    try { return { value: snapshot && guideView ? buildScenarioPublishDocument(snapshot, profile, guideOptions) : null, error: '' }; }
    catch (e) { return { value: null, error: message(e) }; }
  }, [snapshot, profile, guideOptions, guideView]);
  const geometry = useMemo(() => {
    try {
      if (!needsMap) return { value: null, error: '' };
      const maxCells = view === 'print' ? MAX_PRINT_MAP_CELLS : MAX_GUIDE_MAP_CELLS;
      if ((guideView || view === 'print') && snapshot && snapshot.rooms.reduce((sum, r) => sum + (r.piece?.cells.length ?? 0), 0) > maxCells) {
        throw new Error(`ガイドの部屋床は${MAX_GUIDE_MAP_CELLS.toLocaleString()}セルまでです。「マップを含める」をオフにして出力できます。`);
      }
      return { value: resolve(profile.audience), error: '' };
    }
    catch (e) { return { value: null, error: message(e) }; }
  }, [resolve, profile.audience, needsMap, view, snapshot, guideView]);
  // Prose and TOC controls do not affect the embedded map's labels or shapes.
  const mapLabelKey = scenarioDocument.value ? JSON.stringify(scenarioDocument.value.scenario.rooms.map(r => [r.mapRoomId, r.number, r.name])) : '';
  const output = useMemo(() => {
    try { return { value: geometry.value ? guideView
      ? scenarioDocument.value ? renderScenarioMap(geometry.value, scenarioDocument.value, profile) : null
      : renderPublishSvg(geometry.value, profile) : null, error: '' }; }
    catch (e) { return { value: null, error: message(e) }; }
  }, [geometry.value, profile, guideView, mapLabelKey]);
  const renderHtml = useMemo(() => createScenarioHtmlRenderer(), [snapshot]);
  const guideOutput = useMemo(() => {
    try {
      if (!scenarioDocument.value) return { value: '', error: '' };
      const map = output.value ? { audience: profile.audience, svg: output.value.svg } : undefined;
      return { value: renderHtml(buildScenarioGuide(scenarioDocument.value, guideOptions, map)), error: '' };
    } catch (e) { return { value: '', error: message(e) }; }
  }, [scenarioDocument.value, output.value, guideOptions, profile.audience, renderHtml]);
  const printDocument = useMemo(() => {
    try {
      if (view !== 'print' || !snapshot) return { value: null, error: '' };
      if (printProfile.target === 'scenario-guide') return { value: { html: renderScenarioPrintDocument(guideOutput.value, printProfile), layout: null }, error: '' };
      if (!output.value) return { value: null, error: '' };
      const layout = buildPrintLayout(output.value.bounds, printProfile);
      return { value: { html: renderMapPrintDocument(output.value.svg, layout, printProfile, snapshot.name, profile.audience), layout }, error: '' };
    } catch (e) { return { value: null, error: message(e) }; }
  }, [view, snapshot, printProfile, guideOutput.value, output.value, profile.audience]);
  const pageIndex = Math.min(printPage, (printDocument.value?.layout?.pages.length ?? 1) - 1);
  const printPreviewHtml = useMemo(() => {
    const value = printDocument.value;
    if (!value) return '';
    return value.layout && output.value && snapshot
      ? renderMapPrintDocument(output.value.svg, value.layout, printProfile, snapshot.name, profile.audience, pageIndex) : value.html;
  }, [printDocument.value, output.value, snapshot, printProfile, profile.audience, pageIndex]);
  const svgBlob = useMemo(() => output.value ? new Blob([output.value.svg], { type: 'image/svg+xml;charset=utf-8' }) : null, [output.value]);
  const svgUrl = useBlobUrl(svgBlob);
  const unresolved = geometry.value?.unresolvedCount ?? 0;
  let pngError = '';
  if (output.value) { try { validatePngDimensions(output.value.width, output.value.height); } catch (e) { pngError = message(e); } }
  const update = (patch: Partial<PublishProfile>) => {
    setProfile(p => ({ ...p, ...patch })); setNotice(''); setPng(null); setError('');
    if (patch.audience) setAllowUnresolved(false);
  };
  const exportMap = async (format: 'svg' | 'png' | 'html' | 'print-html') => {
    if (exporting.current || !snapshot || (unresolved && !allowUnresolved)
      || (format === 'print-html' ? !printDocument.value : format === 'html' ? !guideOutput.value : !output.value)) return;
    exporting.current = true; setBusy(true); setError(''); setNotice('');
    const revision = snapshotRevision.current;
    try {
      const blob = format === 'print-html' ? new Blob([printDocument.value!.html], { type: 'text/html;charset=utf-8' })
        : format === 'html' ? new Blob([guideOutput.value], { type: 'text/html;charset=utf-8' })
        : format === 'svg' ? svgBlob! : await svgToPng(output.value!.svg, output.value!.width, output.value!.height, profile.background);
      if (!mounted.current || revision !== snapshotRevision.current) return;
      const filename = format === 'print-html' ? exportFilename(snapshot.name, profile.audience, 'svg').replace(/\.svg$/, `-${printProfile.target}-print.html`) : exportFilename(snapshot.name, profile.audience, format);
      downloadBlob(blob, filename);
      if (format === 'png') setPng(blob);
      setNotice(`${format.toUpperCase()}を書き出しました。`);
    } catch (e) { if (mounted.current) setError(message(e)); }
    finally { exporting.current = false; if (mounted.current) setBusy(false); }
  };
  const startPrint = async () => {
    if (exporting.current || !printDocument.value || (unresolved && !allowUnresolved)) return;
    exporting.current = true; setBusy(true); setError(''); setNotice('');
    try { await printer.print(printDocument.value.html); if (mounted.current) setNotice('印刷画面の処理を終了しました。PDF保存・印刷・キャンセルはいずれも正常な操作です。'); }
    catch (e) { if (mounted.current) setError(message(e)); }
    finally { exporting.current = false; if (mounted.current) setBusy(false); }
  };
  const disabled = busy || (view === 'print' ? !printDocument.value : view === 'guide' ? !guideOutput.value : !output.value) || Boolean(unresolved && !allowUnresolved);
  return <main className="publishing">
    <header><h1>出版 / マップ・ガイド・印刷</h1><p>{snapshot?.name ?? '読み込み中…'}</p>
      <p>開いた時点の編集内容を使用します。最新の状態は編集画面の「出版」から取り込めます。</p>
      <p className="publish-help">全体MarkdownはMarkdownエディタで保存してから取り込んでください。出版操作で自動保存は行いません。</p></header>
    <nav className="publish-modes" aria-label="出版形式">{([['map', 'マップ出力'], ['guide', 'シナリオガイド'], ['print', '印刷 / PDF']] as const).map(([mode, label]) =>
      <button key={mode} disabled={busy} aria-pressed={view === mode} onClick={() => { setView(mode); setNotice(''); setError(''); }}>{label}</button>)}</nav>
    <div className="publish-layout">
      <aside>{view === 'print' && <PrintSettings profile={printProfile} disabled={busy} onChange={value => { setPrintProfile(value); setPrintPage(0); setError(''); setNotice(''); }} />}
      <fieldset disabled={busy}><legend>出力設定</legend>
        <label>対象<select value={profile.audience} onChange={e => {
          const audience = e.target.value as PublishProfile['audience'], defaults = defaultPublishProfile(audience);
          setGuideOptions(defaultScenarioGuideOptions(audience));
          update({ audience, showRoomNumbers: defaults.showRoomNumbers, showRoomNames: defaults.showRoomNames });
        }}><option value="player">プレイヤー用</option><option value="gm">GM用</option></select></label>
        {([['showGrid', 'グリッド'], ['showRoomNumbers', '部屋番号'], ['showRoomNames', '部屋名称']] as const).filter(([key]) => !guideView || key !== 'showRoomNumbers').map(([key, label]) =>
          <label className="publish-checkbox" key={key}><input type="checkbox" checked={profile[key]} onChange={e => update({ [key]: e.target.checked })} />{label}</label>)}
        <label>背景<select value={profile.background} onChange={e => update({ background: e.target.value as PublishProfile['background'] })}>
          <option value="white">白色</option><option value="transparent">透明</option></select></label>
        {view !== 'print' && <><label>解像度プリセット<select value={preset}
          onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') update({ pixelsPerCell: Number(e.target.value) }); }}>
          <option value="32">低解像度 32px</option><option value="64">標準 64px</option><option value="128">高解像度 128px</option><option value="custom">カスタム</option></select></label>
        <label>1マスのピクセル数<input type="number" min={1} max={MAX_PIXELS_PER_CELL} step={1} value={Number.isNaN(profile.pixelsPerCell) ? '' : profile.pixelsPerCell}
          onChange={e => { setPreset('custom'); update({ pixelsPerCell: e.target.valueAsNumber }); }} /></label></>}
        <label>マップ周囲余白（マス）<input type="number" min={0} max={MAX_PADDING_CELLS} step={0.5} value={Number.isNaN(profile.paddingCells) ? '' : profile.paddingCells}
          onChange={e => update({ paddingCells: e.target.valueAsNumber })} /></label>
      </fieldset>
      {guideView && <><ScenarioGuideSettings audience={profile.audience} options={guideOptions} disabled={busy}
        onChange={options => { setGuideOptions(options); setNotice(''); setError(''); }} />
        <p className="publish-help">ガイド内のマップには部屋番号を表示します。部屋名称に秘密が含まれる場合があります。公開してよい名称か確認してから有効にしてください。</p>
        <p className="publish-help">外部画像は読み込まず、文書にも含めません。通常の安全なリンクは利用できます。</p>
        {snapshot?.rooms.length === 0 && <p>部屋がありません。空のガイドとして出力できます。</p>}
        {(geometry.error || output.error) && guideOptions.includeMap && <p className="publish-warning">マップを生成できません。「マップを含める」をオフにして文書のみ出力するか、元の配置を修正してください。</p>}
      </>}
      {view === 'print' && <>
        {printProfile.target === 'battle-map' && <p className="publish-warning">{BATTLE_PRINT_INSTRUCTIONS}</p>}
        {snapshot?.rooms.length === 0 && <p>部屋がありません。空の文書・マップを印刷します。</p>}
        <p className="publish-help">画面のマップ用余白（マス）と印刷用のページ余白（mm）は別々に適用されます。PDFの保存先・倍率・用紙はブラウザの印刷画面で確認してください。</p>
      </>}
      <p className="publish-help">プレイヤー用では隠し通路とGM専用情報を除外します。部屋自体はすべて表示されます。</p>
      {view !== 'print' && output.value && <p>出力サイズ: {output.value.width} × {output.value.height}px</p>}
      {unresolved > 0 && <div role="alert" className="publish-warning"><p>出力対象に未解決の接続が{unresolved}件あります。正常な通路としては描画しません。{profile.audience === 'gm' ? 'GM用には警告線を表示します。' : 'プレイヤー用には警告線を表示しません。'}</p>
        <label className="publish-checkbox"><input type="checkbox" disabled={busy} checked={allowUnresolved} onChange={e => setAllowUnresolved(e.target.checked)} />この状態で出力する</label></div>}
      {view === 'map' && pngError && <p className="publish-warning">{pngError} SVGは出力できます。</p>}
      {(error || geometry.error || output.error || scenarioDocument.error || guideOutput.error || printDocument.error) && <p role="alert" className="publish-error">{error || geometry.error || output.error || scenarioDocument.error || guideOutput.error || printDocument.error}</p>}
      <div className="publish-actions">{view === 'print' ? <><button disabled={disabled} onClick={() => void startPrint()}>{busy ? '印刷画面を開いています…' : '印刷 / PDF保存'}</button>
        <button disabled={disabled} onClick={() => void exportMap('print-html')}>印刷用HTMLを保存</button>
        {printer.hasWindows && <button onClick={() => printer.close()}>印刷画面を閉じる</button>}</> : view === 'guide' ? <button disabled={disabled} onClick={() => void exportMap('html')}>HTML出力</button> : <><button disabled={disabled} onClick={() => void exportMap('svg')}>SVG出力</button>
        <button disabled={disabled || Boolean(pngError)} onClick={() => void exportMap('png')}>{busy ? '処理中…' : 'PNG出力'}</button></>}</div>
      <p role="status">{notice}</p>
      {view === 'map' && svgUrl && <a href={svgUrl} target="_blank" rel="noopener">SVGを別タブで確認</a>}
      {view === 'map' && pngUrl && <p><a href={pngUrl} target="_blank" rel="noopener">生成したPNGを確認</a></p>}
      </aside>
      {view === 'print' ? <PrintPreview html={printPreviewHtml} layout={printDocument.value?.layout ?? null} pageIndex={pageIndex} onPageChange={setPrintPage} />
        : view === 'guide' ? <ScenarioGuidePreview html={guideOutput.value} /> : <section aria-label="マッププレビュー" className="publish-preview"><label>プレビュー倍率 {zoom}%<input type="range" min={25} max={250} step={25} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <div className="publish-preview-scroll"><div style={{ width: `${zoom}%` }}>
          {svgUrl && <img src={svgUrl} alt="出版用マップ" style={{ width: '100%', height: 'auto', display: 'block' }} />}
        </div></div>
      </section>}
    </div>
  </main>;
}
