import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DungeonDocument, Piece } from '../../model/types';
import { DEFAULT_PIECES } from '../../model/pieceLibrary';
import { pieceRepository } from '../../repository/pieceRepository';
import type { PublishProfile } from '../../publishing/publishProfile';
import type { PublishMapGeometry } from '../../publishing/publishMapGeometry';
import type { PrintProfile } from '../../publishing/print/printProfile';
import { BATTLE_PRINT_INSTRUCTIONS } from '../../publishing/print/printDocument';
import { buildCorridorInventory, buildDungeonInventory, buildLibraryInventory,
  MAX_QUANTITY_PER_ITEM, withPrintQuantities } from '../../publishing/pieceSheet/inventory';
import type { PieceSheetOptions, PieceSheetSelection } from '../../publishing/pieceSheet/inventory';
import { buildPieceSheetLayout, validatePieceSheetLayout } from '../../publishing/pieceSheet/layout';
import { buildPrintablePiece } from '../../publishing/pieceSheet/artwork';
import { renderPieceSheetDocument } from '../../publishing/pieceSheet/renderer';
import { PrintSettings } from './PrintSettings';

const errorMessage = (e: unknown) => e instanceof Error ? e.message : '印刷シートを生成できません。';
const categories = { room: '部屋', 'manual-corridor': '手動配置通路', 'generated-corridor': '自動生成通路タイル', other: 'その他' } as const;

export function PieceSheetPanel({ snapshot, audience, printProfile, busy, resolve, onAudience, onProfile, onExport, closePrint, notice, error, selection: sheetSelection, onSelection }: {
  selection: PieceSheetSelection; onSelection: Dispatch<SetStateAction<PieceSheetSelection>>;
  snapshot: DungeonDocument | null; audience: PublishProfile['audience']; printProfile: PrintProfile; busy: boolean;
  resolve: (audience: PublishProfile['audience']) => PublishMapGeometry | null;
  onAudience: (audience: PublishProfile['audience']) => void; onProfile: (profile: PrintProfile) => void;
  onExport: (html: string, print: boolean) => void; closePrint: (() => void) | undefined; notice: string; error: string;
}) {
  const { options, quantities, library } = sheetSelection;
  const setOptions = (value: SetStateAction<PieceSheetOptions>) => onSelection(s => ({ ...s, options: typeof value === 'function' ? value(s.options) : value }));
  const setQuantities = (value: SetStateAction<Record<string, number>>) => onSelection(s => ({ ...s, quantities: typeof value === 'function' ? value(s.quantities) : value }));
  const setLibrary = (value: Piece[] | null) => onSelection(s => ({ ...s, library: value }));
  const [libraryError, setLibraryError] = useState('');
  const [reload, setReload] = useState(0), [loading, setLoading] = useState(false);
  const [allowIncomplete, setAllowIncomplete] = useState(false), [selectedPage, setPage] = useState(0);
  useEffect(() => { setAllowIncomplete(false); setPage(0); }, [snapshot]);
  useEffect(() => {
    if (options.source !== 'library' || (library && reload === 0)) return;
    let active = true;
    setLoading(true); setLibraryError('');
    pieceRepository.list().then(pieces => {
      if (active) { setLibrary(structuredClone([...DEFAULT_PIECES, ...pieces])); setQuantities({}); }
    }).catch(e => { if (active) { setLibrary(null); setLibraryError(errorMessage(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [options.source, reload]);
  // Source extraction/routing is isolated from quantities, paper, and drawing settings.
  const inventory = useMemo(() => {
    try {
      const value = options.source === 'library' ? library ? buildLibraryInventory(library) : null
        : options.source === 'corridor-tiles' ? buildCorridorInventory()
        : snapshot ? buildDungeonInventory(snapshot, audience, options.includeGeneratedCorridors, () => resolve(audience)!) : null;
      return { value, error: '' };
    } catch (e) { return { value: null, error: errorMessage(e) }; }
  }, [snapshot, audience, options.source, options.includeGeneratedCorridors, library, resolve]);
  const selection = useMemo(() => {
    try { return { items: withPrintQuantities(inventory.value?.items ?? [], quantities), error: '' }; }
    catch (e) { return { items: [], error: errorMessage(e) }; }
  }, [inventory.value, quantities]);
  const result = useMemo(() => {
    try {
      if (!inventory.value || selection.error) return { layout: null, errors: [] };
      const layout = buildPieceSheetLayout(selection.items, printProfile, options);
      return { layout, errors: validatePieceSheetLayout(layout, selection.items, printProfile, options) };
    } catch (e) { return { layout: null, errors: [errorMessage(e)] }; }
  }, [inventory.value, selection, printProfile, options]);
  const pageIndex = Math.max(0, Math.min(selectedPage, (result.layout?.pages.length ?? 1) - 1));
  const output = useMemo(() => {
    try {
      const layout = result.layout;
      if (!layout?.pages.length) return { html: '', preview: '', error: '' };
      return { html: result.errors.length ? '' : renderPieceSheetDocument(selection.items, layout, printProfile, options),
        preview: renderPieceSheetDocument(selection.items, layout, printProfile, options, pageIndex), error: '' };
    } catch (e) { return { html: '', preview: '', error: errorMessage(e) }; }
  }, [result, selection.items, printProfile, options, pageIndex]);
  const thumbnails = useMemo(() => new Map((inventory.value?.items ?? []).map(i => {
    const a = buildPrintablePiece(i, 0, options);
    return [i.id, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${a.widthCells * 40 + 4} ${a.heightCells * 40 + 4}">${a.svg}</svg>`];
  })), [inventory.value, options.showGrid, options.showCutLines, options.showConnectorMarks]);
  const warnings = inventory.value?.warnings ?? [];
  const deficient = selection.items.filter(i => i.printQuantity < i.requiredQuantity);
  const blocked = busy || loading || !output.html || Boolean(warnings.length && !allowIncomplete);
  const update = (patch: Partial<PieceSheetOptions>) => {
    setOptions(o => ({ ...o, ...patch })); setPage(0);
    if (patch.source || patch.includeGeneratedCorridors !== undefined) { setQuantities({}); setAllowIncomplete(false); }
  };
  const setQuantity = (id: string, value: number) => { setQuantities(q => ({ ...q, [id]: value })); setPage(0); };
  return <div className="publish-layout piece-sheet-layout"><aside>
    <fieldset disabled={busy}><legend>ピース印刷</legend>
      <label>印刷素材の取得元<select value={options.source} onChange={e => update({ source: e.target.value as PieceSheetOptions['source'] })}>
        <option value="dungeon">ダンジョン使用ピース</option><option value="library">ピースライブラリ</option><option value="corridor-tiles">通路素材</option></select></label>
      {options.source === 'dungeon' && <><label>公開対象<select value={audience} onChange={e => { onAudience(e.target.value as PublishProfile['audience']); setQuantities({}); setAllowIncomplete(false); }}>
        <option value="player">プレイヤー用</option><option value="gm">GM用</option></select></label>
        <label className="publish-checkbox"><input type="checkbox" checked={options.includeGeneratedCorridors} onChange={e => update({ includeGeneratedCorridors: e.target.checked })} />自動生成通路を含める</label></>}
      <label>ピース間余白（mm）<input type="number" min={0} max={30} step={0.5} value={Number.isNaN(options.pieceGapMm) ? '' : options.pieceGapMm} onChange={e => update({ pieceGapMm: e.target.valueAsNumber })} /></label>
      {([['allowRotation', '90度回転を許可'], ['separateRoomsAndCorridors', '部屋と通路を別ページにする'], ['showGrid', '内部グリッド'],
        ['showCutLines', '切り抜き線'], ['showConnectorMarks', 'Connector記号'], ['showPieceLabels', 'ピース名称']] as const).map(([key, label]) =>
        <label className="publish-checkbox" key={key}><input type="checkbox" checked={options[key]} onChange={e => update({ [key]: e.target.checked })} />{label}</label>)}
    </fieldset>
    <PrintSettings pieceSheet profile={printProfile} disabled={busy} onChange={p => { onProfile(p); setPage(0); }} />
    <p className="publish-help">{BATTLE_PRINT_INSTRUCTIONS}</p>
    <p className="publish-help">実寸を維持し、収まらない素材は縮小・分割しません。プレイヤー用は汎用の素材番号を使用します。ライブラリは取得時点の定義を保持します。</p>
    {warnings.length > 0 && <div className="publish-warning" role="alert">{warnings.map(w => <p key={w}>{w}</p>)}
      <label className="publish-checkbox"><input type="checkbox" disabled={busy} checked={allowIncomplete} onChange={e => setAllowIncomplete(e.target.checked)} />警告を確認して出力する</label></div>}
    {deficient.length > 0 && <p role="alert" className="publish-warning">必要数より印刷数が少ない素材が{deficient.length}種類あります。ダンジョン全体を再構成できない可能性があります。</p>}
    {[error, libraryError, inventory.error, selection.error, ...result.errors, output.error].filter(Boolean).map((e, i) => <p role="alert" className="publish-error" key={i}>{e}</p>)}
    <div className="publish-actions"><button disabled={blocked} onClick={() => onExport(output.html, true)}>印刷 / PDF保存</button>
      <button disabled={blocked} onClick={() => onExport(output.html, false)}>印刷用HTMLを保存</button>
      {closePrint && <button onClick={closePrint}>印刷画面を閉じる</button>}</div><p role="status">{notice}</p>
  </aside><section className="piece-sheet-content" aria-label="ピース一覧と印刷プレビュー">
    <h2>素材と印刷数量</h2>
    {loading && <p role="status">ライブラリを読み込み中…</p>}
    {options.source === 'library' && <button disabled={busy || loading} onClick={() => { setReload(n => n + 1); setAllowIncomplete(false); }}>ライブラリを再取得</button>}
    <div className="publish-actions"><button disabled={busy || loading || !inventory.value} onClick={() => { setQuantities(Object.fromEntries(inventory.value!.items.map(i => [i.id, Math.max(1, i.requiredQuantity)]))); setPage(0); }}>すべて選択</button>
      <button disabled={busy || loading || !inventory.value} onClick={() => { setQuantities(Object.fromEntries(inventory.value!.items.map(i => [i.id, 0]))); setPage(0); }}>すべて解除</button>
      {options.source === 'dungeon' && <button disabled={busy || loading} onClick={() => { setQuantities({}); setPage(0); }}>必要数に戻す</button>}</div>
    <div className="piece-inventory-list">{(inventory.value?.items ?? []).map(i => {
      const quantity = Object.hasOwn(quantities, i.id) ? quantities[i.id] : i.printQuantity;
      const xs = i.piece.cells.map(c => c.x), ys = i.piece.cells.map(c => c.y);
      return <article key={i.id} className="piece-inventory-item">
        <img alt={`${i.name}の形状`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(thumbnails.get(i.id) ?? '')}`} />
        <div><strong>{i.name}</strong><p>{i.source === 'generated-corridor' ? '生成素材' : i.standard ? '標準ピース' : 'ユーザー定義'} · {categories[i.category]} · {Math.max(...xs) - Math.min(...xs) + 1} × {Math.max(...ys) - Math.min(...ys) + 1}マス</p>
          {options.source === 'dungeon' && <p>必要数: {i.requiredQuantity}</p>}
          <label className="publish-checkbox"><input type="checkbox" disabled={busy || loading} checked={quantity > 0} onChange={e => setQuantity(i.id, e.target.checked ? Math.max(1, i.requiredQuantity) : 0)} />{i.name}を印刷</label>
          <label>{i.name}の印刷数<input type="number" disabled={busy || loading} min={0} max={MAX_QUANTITY_PER_ITEM} step={1} value={Number.isNaN(quantity) ? '' : quantity} onChange={e => setQuantity(i.id, e.target.valueAsNumber)} /></label></div>
      </article>;
    })}</div>
    {inventory.value?.items.length === 0 && <p>素材がありません。</p>}
    <div className="piece-sheet-summary" aria-label="印刷集計">{Object.entries(categories).map(([key, label]) => {
      const group = selection.items.filter(i => i.category === key);
      return <p key={key}>{label}: 印刷 {group.reduce((n, i) => n + i.printQuantity, 0)}枚{options.source === 'dungeon' ? ` / 必要 ${group.reduce((n, i) => n + i.requiredQuantity, 0)}枚` : ''}</p>;
    })}<p>合計: {selection.items.reduce((n, i) => n + i.printQuantity, 0)}枚 · {printProfile.paperSize} · Grid: {printProfile.map.cellSizeMm} mm</p>
      <p>必要用紙: {result.layout?.pages.length ?? 0}枚 · 未配置: {result.layout?.unplacedPieces.length ?? 0}枚</p></div>
    {Boolean(result.layout?.unplacedPieces.length) && <details open><summary>未配置ピース（縮小せず出力を停止しています）</summary>
      <ul>{result.layout!.unplacedPieces.map(p => <li key={p.instanceId}>{p.name}: 余白・ラベル込み {p.widthMm.toFixed(2)} × {p.heightMm.toFixed(2)} mm — {p.reason === 'oversized' ? '用紙内に収まりません' : '100ページの上限です'}</li>)}</ul></details>}
    <h2>印刷プレビュー</h2><div className="print-page-list">{result.layout?.pages.map(p => <button key={p.index} aria-pressed={pageIndex === p.index} onClick={() => setPage(p.index)}>Page {p.index + 1}</button>)}</div>
    <section className="publish-guide-preview"><iframe title="ピース印刷シート" sandbox="" referrerPolicy="no-referrer" srcDoc={output.preview} /></section>
  </section></div>;
}
