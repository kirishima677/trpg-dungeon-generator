import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { ROOM_CONSTRAINT_FIELDS, ROOM_THEME_LIMITS } from '../../model/roomTheme';
import type { RoomThemeForm } from '../../themes/roomThemeForm';
import type { ContentDefinition } from '../../model/content';
import { CONTENT_KINDS, CONTENT_LABELS } from '../../model/content';
import { ENTITY_LIMITS } from '../../model/entity';
import { ContentSelectionDialog } from '../entities/ContentSelectionDialog';
import { ContentMarkdown } from '../content/ContentFields';

export function RoomConstraintsEditor({ form,change }: {form:RoomThemeForm;change:(form:RoomThemeForm)=>void}) {
  const labels = { Cells:'占有セル数',Connectors:'コネクタ数',Width:'幅',Height:'高さ' };
  return <section aria-label="Piece構造条件"><h2>Piece構造条件</h2><p>空欄は制約なし。コネクタ数の0は明示的な条件です。候補は4方向の回転を評価します。</p>
    <div className="room-constraints">{ROOM_CONSTRAINT_FIELDS.map(f => <label key={f}>{labels[f.slice(3) as keyof typeof labels]} {f.startsWith('min')?'最小':'最大'}<input aria-label={f} inputMode="numeric" value={form.constraints[f]} onChange={e => change({...form,constraints:{...form.constraints,[f]:e.target.value}})} /></label>)}</div>
  </section>;
}
export function RequiredContentsEditor({ form,change,contents,ready,error }: {form:RoomThemeForm;change:(form:RoomThemeForm)=>void;contents:ContentDefinition[];ready:boolean;error:string}) {
  const [adding,setAdding] = useState(false),[selected,setSelected] = useState('');
  const item = form.required.find(v => v.entry.id===selected);
  const patch = (value: Partial<NonNullable<typeof item>['entry']>) => change({...form,required:form.required.map(r => r.entry.id===selected?{...r,entry:{...r.entry,...value}}:r)});
  return <section aria-label="必須Content構成"><h2>必須Content構成</h2><p>1構成項目から数量を持つEntityを1件生成します。同じ素材を複数項目に指定できます。</p>
    {error && <p role="alert">{error}</p>}<fieldset disabled={adding}>
    <button disabled={!ready||!!error||form.required.length>=ROOM_THEME_LIMITS.required} onClick={() => setAdding(true)}>Content Libraryから必須項目を追加</button>
    <p>{form.required.length} / {ROOM_THEME_LIMITS.required}項目</p>
    <div className="theme-candidates">{form.required.map(r => <button key={r.entry.id} aria-pressed={selected===r.entry.id} onClick={() => setSelected(r.entry.id)}>
      {r.entry.customName || contents.find(c => c.id===r.entry.contentId)?.name || r.entry.contentId} / {CONTENT_LABELS[r.entry.expectedKind]} × {r.quantity}<small>{r.entry.id}</small></button>)}</div>
    {item && <section aria-label="必須項目の編集"><p>構成項目ID: {item.entry.id}</p><label>Content ID<input aria-label="必須Content ID" value={item.entry.contentId} maxLength={128} onChange={e => patch({contentId:e.target.value})} /></label>
      <label>想定種別<select aria-label="必須Content種別" value={item.entry.expectedKind} onChange={e => patch({expectedKind:e.target.value as typeof item.entry.expectedKind})}>{CONTENT_KINDS.map(k => <option key={k} value={k}>{CONTENT_LABELS[k]}</option>)}</select></label>
      <label>数量<input aria-label="必須Content数量" inputMode="numeric" value={item.quantity} onChange={e => change({...form,required:form.required.map(r => r.entry.id===selected?{...r,quantity:e.target.value}:r)})} /></label>
      <label>個別名称<input aria-label="必須Content個別名称" maxLength={ENTITY_LIMITS.name} value={item.entry.customName} onChange={e => patch({customName:e.target.value})} /></label>
      <label>公開範囲<select aria-label="必須Content公開範囲" value={item.entry.visibility} onChange={e => patch({visibility:e.target.value as typeof item.entry.visibility})}><option value="gm-only">GM専用</option><option value="public">配置の公開説明を公開可能</option></select></label>
      <ContentMarkdown key={selected} prefix="必須の" maxLength={ENTITY_LIMITS.markdown} description={item.entry.publicDescription} gmNotes={item.entry.gmNotes} onChange={(field,value) => patch({[field==='description'?'publicDescription':'gmNotes']:value})} />
      <button onClick={() => {change({...form,required:form.required.filter(r => r.entry.id!==selected)});setSelected('');}}>必須項目を削除</button>
    </section>}</fieldset>
    {adding && <ContentSelectionDialog contents={contents} busy={false} error={error} dialogLabel="必須Contentの追加" confirmLabel="必須項目として追加" description="テーマには素材の参照IDを保存します。Entityの配置は部屋に適用した後の別操作です。" onClose={() => setAdding(false)} onAdd={(id,quantity) => {
      const content=contents.find(c => c.id===id);if(!content)return;
      const entry={id:uuid(),contentId:content.id,expectedKind:content.kind,quantity,customName:'',publicDescription:'',gmNotes:'',visibility:'gm-only' as const};
      change({...form,required:[...form.required,{entry,quantity:String(quantity)}]});setSelected(entry.id);setAdding(false);
    }} />}
  </section>;
}
