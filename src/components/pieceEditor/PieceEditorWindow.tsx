import { useMemo, useRef, useState } from 'react';
import type { ConnectorDirection, ConnectorKind, Piece } from '../../model/types';
import { DEFAULT_PIECES } from '../../model/pieceLibrary';
import { GRID_LINE_COLOR, GRID_LINE_WIDTH, GRID_SIZE } from '../../editor/grid';
import { changePieceCell, duplicatePiece, isExteriorConnector, isStandardPiece, MAX_PIECE_SIZE, pieceErrors, PIECE_DIRECTIONS, PIECE_KINDS } from '../../editor/pieces/pieceDefinition';
import { buildPieceExport, parsePieceImport } from '../../editor/pieces/pieceJson';
import { downloadJson } from '../../utils/exportImport';
import { pieceRepository } from '../../repository/pieceRepository';
import { usePieceLibrary } from '../pieces/usePieceLibrary';
import './pieceEditor.css';

const emptyPiece = (): Piece => ({ id: crypto.randomUUID(), name: '新しいピース', shape: 'custom', cells: [], connectors: [], tags: [] });
type Tool = 'add' | 'remove' | 'connector';

export function PieceEditorWindow() {
  const library = usePieceLibrary();
  const [draft, setDraft] = useState<Piece>(emptyPiece);
  const [saved, setSaved] = useState<Piece | null>(null);
  const [tags, setTags] = useState('');
  const [tool, setTool] = useState<Tool>('add');
  const [cell, setCell] = useState({ x: 0, y: 0 });
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [direction, setDirection] = useState<ConnectorDirection>('north');
  const [kind, setKind] = useState<ConnectorKind>('door');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const standard = isStandardPiece(draft.id), locked = saved !== null;
  const dirty = saved === null || JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = useMemo(() => pieceErrors(draft), [draft]);
  const occupied = useMemo(() => new Set(draft.cells.map(c => `${c.x},${c.y}`)), [draft.cells]);
  const connector = draft.connectors.find(c => c.id === selectedConnector);

  const choose = (piece: Piece, persisted: boolean) => {
    setDraft(structuredClone(piece)); setSaved(persisted ? structuredClone(piece) : null);
    setTags((piece.tags ?? []).join(', ')); setSelectedConnector(null); setCell({ x: 0, y: 0 }); setMessage('');
  };
  const switchTo = (piece: Piece, persisted: boolean) => {
    if (dirty && (draft.cells.length > 0 || draft.name !== '新しいピース') && !window.confirm('未保存の編集を破棄して切り替えますか？')) return;
    choose(piece, persisted);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); }
    catch (e) { setMessage(e instanceof Error ? e.message : '操作に失敗しました。'); }
    finally { setBusy(false); }
  };
  const changeCell = (position: { x: number; y: number }) => {
    setCell(position); setSelectedConnector(null);
    if (locked || tool === 'connector') return;
    const changed = changePieceCell(draft, position, tool === 'add');
    setDraft(changed.piece);
    setMessage(changed.removed.length ? `セル変更で配置できなくなった接続口を${changed.removed.length}件削除しました。` : '');
  };
  const save = () => run(async () => {
    const piece = await pieceRepository.save(draft);
    choose(piece, true); await library.reload(); setMessage('保存しました。メイン画面のライブラリへ反映します。');
  });
  const addConnector = () => {
    if (locked || !isExteriorConnector(draft.cells, cell, direction)) { setMessage('床セルの外周を選んでください。'); return; }
    if (draft.connectors.some(c => c.position.x === cell.x && c.position.y === cell.y && c.direction === direction)) { setMessage('そのセル・方向には接続口があります。'); return; }
    const added = { id: crypto.randomUUID(), position: { ...cell }, direction, kind, width: 1 };
    setDraft({ ...draft, connectors: [...draft.connectors, added] }); setSelectedConnector(added.id); setMessage('');
  };
  const editConnector = (nextDirection: ConnectorDirection, nextKind: ConnectorKind) => {
    if (!connector || locked) return;
    if (!isExteriorConnector(draft.cells, connector.position, nextDirection)
      || draft.connectors.some(c => c.id !== connector.id && c.position.x === connector.position.x && c.position.y === connector.position.y && c.direction === nextDirection)) {
      setMessage('接続口の向きが内部、または別の接続口と重複しています。'); return;
    }
    setDirection(nextDirection); setKind(nextKind);
    setDraft({ ...draft, connectors: draft.connectors.map(c => c.id === connector.id ? { ...c, direction: nextDirection, kind: nextKind } : c) });
  };

  return <main className="piece-editor" aria-label="ピースエディタ">
    <header><h1>ピースエディタ</h1><span>{standard ? '標準（複製して編集）' : saved ? 'ユーザー定義' : '新規'} / {dirty ? '未保存' : '保存済み'}</span></header>
    <nav aria-label="ピースの操作">
      <button disabled={busy} onClick={() => switchTo(emptyPiece(), false)}>新規</button>
      <button disabled={busy || standard || errors.length > 0} onClick={() => void save()}>保存</button>
      <button disabled={busy || errors.length > 0} onClick={() => choose(duplicatePiece(draft), false)}>複製して編集</button>
      <button disabled={busy || standard || !saved} onClick={() => void run(async () => {
        await pieceRepository.delete(draft.id); choose(emptyPiece(), false); await library.reload(); setMessage('削除しました。');
      })}>削除</button>
      <button disabled={busy} onClick={() => input.current?.click()}>Import JSON</button>
      <button disabled={busy || standard || errors.length > 0} onClick={() => downloadJson(buildPieceExport(draft), `${draft.name.replace(/[\\/:*?"<>|]/g, '_')}.piece.json`)}>Export JSON</button>
    </nav>
    <div className="piece-message" role="status">{message || library.error || (locked ? '形状・接続口の変更は「複製して編集」から行ってください。' : 'セルをクリックして形状を作成してください。')}</div>
    <div className="piece-layout">
      <aside className="piece-list" aria-label="ピース一覧">
        <h2>標準ピース</h2>
        {DEFAULT_PIECES.map(p => <button key={p.id} disabled={busy} aria-pressed={p.id === draft.id} onClick={() => switchTo(p, true)}>{p.name}</button>)}
        <h2>ユーザー定義</h2>
        {library.pieces.length === 0 && <p>登録されていません</p>}
        {library.pieces.map(p => <button key={p.id} disabled={busy} aria-pressed={p.id === draft.id} onClick={() => switchTo(p, true)}>{p.name}</button>)}
      </aside>
      <section className="piece-grid-pane" aria-label="形状の編集">
        <div className="piece-tools">
          {([['add', 'セル追加'], ['remove', 'セル削除'], ['connector', '接続口を選択']] as const).map(([value, label]) =>
            <button key={value} aria-pressed={tool === value} disabled={busy || locked} onClick={() => { setTool(value); setSelectedConnector(null); }}>{label}</button>)}
          <span>{MAX_PIECE_SIZE}×{MAX_PIECE_SIZE} / {draft.cells.length}セル</span>
        </div>
        <div className="piece-grid-scroll">
          <svg width={MAX_PIECE_SIZE * GRID_SIZE + 2} height={MAX_PIECE_SIZE * GRID_SIZE + 2} aria-label="ピース編集グリッド">
            <g transform="translate(1,1)">
              {Array.from({ length: MAX_PIECE_SIZE ** 2 }, (_, i) => {
                const x = i % MAX_PIECE_SIZE, y = Math.floor(i / MAX_PIECE_SIZE), active = occupied.has(`${x},${y}`);
                return <rect key={i} x={x * GRID_SIZE} y={y * GRID_SIZE} width={GRID_SIZE} height={GRID_SIZE}
                  fill={active ? '#dbeafe' : '#f8fafc'} stroke={active ? GRID_LINE_COLOR : '#cbd5e1'} strokeWidth={active ? GRID_LINE_WIDTH : 0.5}
                  role="checkbox" aria-checked={active} aria-label={`セル ${x},${y}`} tabIndex={locked || busy ? -1 : 0}
                  onClick={() => { if (!busy) changeCell({ x, y }); }} onKeyDown={e => {
                    if (!locked && !busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); changeCell({ x, y }); }
                  }} />;
              })}
              {draft.connectors.map(c => {
                const dx = c.direction === 'east' ? 1 : c.direction === 'west' ? 0 : 0.5;
                const dy = c.direction === 'south' ? 1 : c.direction === 'north' ? 0 : 0.5;
                return <circle key={c.id} cx={(c.position.x + dx) * GRID_SIZE} cy={(c.position.y + dy) * GRID_SIZE} r={6}
                  fill={selectedConnector === c.id ? '#2563eb' : '#f59e0b'} stroke="white" role="button" tabIndex={0}
                  aria-label={`接続口 ${c.direction} ${c.position.x},${c.position.y}`} onClick={e => {
                    e.stopPropagation(); setSelectedConnector(c.id); setCell(c.position); setDirection(c.direction); setKind(c.kind);
                  }} onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedConnector(c.id); setCell(c.position); setDirection(c.direction); setKind(c.kind); }
                  }} />;
              })}
              <rect x={cell.x * GRID_SIZE + 2} y={cell.y * GRID_SIZE + 2} width={GRID_SIZE - 4} height={GRID_SIZE - 4} fill="none" stroke="#2563eb" strokeDasharray="4 2" pointerEvents="none" />
            </g>
          </svg>
        </div>
      </section>
      <aside className="piece-properties" aria-label="ピースのプロパティ">
        <label>名称<input aria-label="ピース名称" value={draft.name} maxLength={120} disabled={standard || busy} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>タグ（カンマ区切り）<input aria-label="ピースのタグ" value={tags} disabled={standard || busy} onChange={e => { setTags(e.target.value); setDraft({ ...draft, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }); }} /></label>
        <small>Piece ID: {draft.id}</small>
        <h2>接続口設定</h2><p>選択セル: ({cell.x}, {cell.y}) / 幅: 1セル固定</p>
        <label>方向<select aria-label="接続口の方向" value={direction} disabled={locked || busy} onChange={e => {
          const value = e.target.value as ConnectorDirection;
          if (connector) editConnector(value, kind); else setDirection(value);
        }}>{PIECE_DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
        <label>種類<select aria-label="接続口の種類" value={kind} disabled={locked || busy} onChange={e => {
          const value = e.target.value as ConnectorKind;
          if (connector) editConnector(direction, value); else setKind(value);
        }}>{PIECE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <button disabled={locked || busy} onClick={addConnector}>接続口を追加</button>
        <button disabled={locked || busy || !connector} onClick={() => { setDraft({ ...draft, connectors: draft.connectors.filter(c => c.id !== selectedConnector) }); setSelectedConnector(null); }}>選択した接続口を削除</button>
        <ul>{draft.connectors.map(c => <li key={c.id}><button onClick={() => { setSelectedConnector(c.id); setCell(c.position); setDirection(c.direction); setKind(c.kind); }}>{c.direction} ({c.position.x},{c.position.y}) / {c.kind}</button></li>)}</ul>
        {errors.length > 0 && <ul role="alert">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
      </aside>
    </div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (file) void run(async () => {
        if (file.size > 1_000_000) throw new Error('ピースJSONは1MB以内にしてください。');
        const piece = parsePieceImport(JSON.parse(await file.text()));
        await pieceRepository.importAll([piece]); choose(piece, true); await library.reload(); setMessage('インポートしました。');
      });
    }} />
  </main>;
}
