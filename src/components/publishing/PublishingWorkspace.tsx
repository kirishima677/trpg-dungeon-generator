import type { PublishProfile } from '../../publishing/publishProfile';
import { defaultPublishProfile, MAX_PADDING_CELLS, MAX_PIXELS_PER_CELL } from '../../publishing/publishProfile';
import { BATTLE_PRINT_INSTRUCTIONS } from '../../publishing/print/printDocument';
import { ScenarioGuideSettings } from './ScenarioGuideSettings';
import { ScenarioGuidePreview } from './ScenarioGuidePreview';
import { PrintSettings } from './PrintSettings';
import { PrintPreview } from './PrintPreview';
import { PieceSheetPanel } from './PieceSheetPanel';
import { PackagePanel } from './PackagePanel';
import { usePublicationController } from './usePublicationController';
import type { PublicationRuntime } from './usePublicationActions';
import type { PublicationController } from './usePublicationController';

export function PublishingWorkspace({ runtime }: { runtime?: PublicationRuntime } = {}) {
  return <PublishingView controller={usePublicationController(runtime)} />;
}

export function PublishingView({ controller }: { controller: PublicationController }) {
  const { snapshot, profile, view, setView, busy, printProfile, setPrintProfile, setPrintPage,
    guideProfiles, guideOptions, setGuideOptions, sheetSelection, setSheetSelection, packageProfile, setPackageProfile,
    preset, setPreset, zoom, setZoom, error, setError, notice, setNotice, setBusy, allowUnresolved, setAllowUnresolved,
    pngUrl, session, geometry, guideView, output, printDocument, printPreviewHtml, pageIndex, svgUrl, unresolved,
    pngError, update, guide, generationError, disabled, exportMap, startPrint, exportPieceSheets, printer } = controller;
  return <main className="publishing">
    <header><h1>出版 / マップ・ガイド・印刷</h1><p>{snapshot?.name ?? '読み込み中…'}</p>
      <p>開いた時点の編集内容を使用します。最新の状態は編集画面の「出版」から取り込めます。</p>
      <p className="publish-help">全体MarkdownはMarkdownエディタで保存してから取り込んでください。出版操作で自動保存は行いません。</p></header>
    <nav className="publish-modes" aria-label="出版形式">{([['map', 'マップ出力'], ['guide', 'シナリオガイド'], ['print', '印刷 / PDF'], ['pieces', 'ピース印刷'], ['package', '一括出版']] as const).map(([mode, label]) =>
      <button key={mode} disabled={busy} aria-pressed={view === mode} onClick={() => { setView(mode); setNotice(''); setError(''); }}>{label}</button>)}</nav>
    {view === 'package' ? <PackagePanel profile={packageProfile} onProfile={setPackageProfile} snapshot={snapshot} settings={{ publish: profile, guides: guideProfiles, print: printProfile, pieces: sheetSelection }} onBusy={setBusy} /> : view === 'pieces' ? <PieceSheetPanel selection={sheetSelection} onSelection={setSheetSelection} snapshot={snapshot} audience={profile.audience} printProfile={printProfile} busy={busy}
      session={session} onAudience={audience => update({ audience })} onProfile={setPrintProfile}
      onExport={(html, print) => void exportPieceSheets(html, print)} closePrint={printer.hasWindows ? printer.close : undefined} notice={notice} error={error} /> : <div className="publish-layout">
      <aside>{view === 'print' && <PrintSettings profile={printProfile} disabled={busy} onChange={value => { setPrintProfile(value); setPrintPage(0); setError(''); setNotice(''); }} />}
      <fieldset disabled={busy}><legend>出力設定</legend>
        <label>対象<select value={profile.audience} onChange={e => {
          const audience = e.target.value as PublishProfile['audience'], defaults = defaultPublishProfile(audience);
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
        {(geometry.error || guide.error) && guideOptions.includeMap && <p className="publish-warning">マップを生成できません。「マップを含める」をオフにして文書のみ出力するか、元の配置を修正してください。</p>}
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
      {(error || generationError) && <p role="alert" className="publish-error">{error || generationError}</p>}
      <div className="publish-actions">{view === 'print' ? <><button disabled={disabled} onClick={() => void startPrint()}>{busy ? '印刷画面を開いています…' : '印刷 / PDF保存'}</button>
        <button disabled={disabled} onClick={() => void exportMap('print-html')}>印刷用HTMLを保存</button>
        {printer.hasWindows && <button onClick={() => printer.close()}>印刷画面を閉じる</button>}</> : view === 'guide' ? <button disabled={disabled} onClick={() => void exportMap('html')}>HTML出力</button> : <><button disabled={disabled} onClick={() => void exportMap('svg')}>SVG出力</button>
        <button disabled={disabled || Boolean(pngError)} onClick={() => void exportMap('png')}>{busy ? '処理中…' : 'PNG出力'}</button></>}</div>
      <p role="status">{notice}</p>
      {view === 'map' && svgUrl && <a href={svgUrl} target="_blank" rel="noopener">SVGを別タブで確認</a>}
      {view === 'map' && pngUrl && <p><a href={pngUrl} target="_blank" rel="noopener">生成したPNGを確認</a></p>}
      </aside>
      {view === 'print' ? <PrintPreview html={printPreviewHtml} layout={printDocument.value?.layout ?? null} pageIndex={pageIndex} onPageChange={setPrintPage} />
        : view === 'guide' ? <ScenarioGuidePreview html={guide.value?.html ?? ''} /> : <section aria-label="マッププレビュー" className="publish-preview"><label>プレビュー倍率 {zoom}%<input type="range" min={25} max={250} step={25} value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <div className="publish-preview-scroll"><div style={{ width: `${zoom}%` }}>
          {svgUrl && <img src={svgUrl} alt="出版用マップ" style={{ width: '100%', height: 'auto', display: 'block' }} />}
        </div></div>
      </section>}
    </div>}
  </main>;
}
