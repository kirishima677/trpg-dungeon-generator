import { changePrintTarget, MAX_CELL_SIZE_MM, MIN_CELL_SIZE_MM, PAPER_SIZES } from '../../publishing/print/printProfile';
import type { PrintProfile, PrintTarget } from '../../publishing/print/printProfile';

export function PrintSettings({ profile, disabled, onChange, pieceSheet = false }: { pieceSheet?: boolean; profile: PrintProfile; disabled: boolean; onChange: (profile: PrintProfile) => void }) {
  const [customCell, setCustomCell] = useState(false);
  const update = (patch: Partial<PrintProfile>) => onChange({ ...profile, ...patch });
  const battle = pieceSheet || profile.target === 'battle-map';
  return <fieldset disabled={disabled}><legend>印刷設定</legend>
    {!pieceSheet && <label>印刷対象<select value={profile.target} onChange={e => onChange(changePrintTarget(profile, e.target.value as PrintTarget))}>
      <option value="scenario-guide">シナリオガイド</option><option value="reference-map">参照用マップ</option><option value="battle-map">卓上プレイ用マップ</option></select></label>}
    <label>用紙<select value={profile.paperSize} onChange={e => update({ paperSize: e.target.value as PrintProfile['paperSize'] })}>
      {Object.keys(PAPER_SIZES).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
    <label>用紙方向<select value={profile.orientation} onChange={e => update({ orientation: e.target.value as PrintProfile['orientation'] })}>
      <option value="portrait">縦</option><option value="landscape">横</option></select></label>
    {([['top', '上余白'], ['right', '右余白'], ['bottom', '下余白'], ['left', '左余白']] as const).map(([key, label]) =>
      <label key={key}>{label}（mm）<input type="number" min={0} step={0.5} value={Number.isNaN(profile.marginsMm[key]) ? '' : profile.marginsMm[key]}
        onChange={e => update({ marginsMm: { ...profile.marginsMm, [key]: e.target.valueAsNumber } })} /></label>)}
    {(pieceSheet || profile.target !== 'scenario-guide') && <label className="publish-checkbox"><input type="checkbox" checked={profile.showPageLabels}
      onChange={e => update({ showPageLabels: e.target.checked })} />ページラベル</label>}
    {battle && <>
      <label>グリッド寸法プリセット<select value={!customCell && [15, 20, 25, 25.4, 30].includes(profile.map.cellSizeMm) ? profile.map.cellSizeMm : 'custom'}
        onChange={e => { setCustomCell(e.target.value === 'custom'); if (e.target.value !== 'custom') update({ map: { ...profile.map, cellSizeMm: Number(e.target.value) } }); }}>
        {[15, 20, 25, 25.4, 30].map(n => <option key={n} value={n}>{n} mm</option>)}<option value="custom">カスタム（下欄で指定）</option></select></label>
      <label>1マスの寸法（mm）<input type="number" min={MIN_CELL_SIZE_MM} max={MAX_CELL_SIZE_MM} step={0.1}
        value={Number.isNaN(profile.map.cellSizeMm) ? '' : profile.map.cellSizeMm} onChange={e => { setCustomCell(true); update({ map: { ...profile.map, cellSizeMm: e.target.valueAsNumber } }); }} /></label>
      {!pieceSheet && <><label className="publish-checkbox"><input type="checkbox" checked={profile.map.allowTiling} onChange={e => update({ map: { ...profile.map, allowTiling: e.target.checked } })} />分割印刷</label>
      <label>重複領域（mm）<input type="number" min={0} max={100} step={1} list="print-overlap-presets" value={Number.isNaN(profile.map.tileOverlapMm) ? '' : profile.map.tileOverlapMm}
        onChange={e => update({ map: { ...profile.map, tileOverlapMm: e.target.valueAsNumber } })} /><datalist id="print-overlap-presets"><option value={0} /><option value={5} /><option value={10} /></datalist></label></>}
      {([['showCutMarks', 'カットマーク'], ['showScaleBar', '縮尺確認用の目盛り']] as const).filter(([key]) => !pieceSheet || key !== 'showCutMarks').map(([key, label]) =>
        <label key={key} className="publish-checkbox"><input type="checkbox" checked={profile.map[key]} onChange={e => update({ map: { ...profile.map, [key]: e.target.checked } })} />{label}</label>)}
    </>}
  </fieldset>;
}
import { useState } from 'react';
