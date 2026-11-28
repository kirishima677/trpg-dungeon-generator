import {intersectById} from './selectionSets';
import type { FactionDraft } from './faction';
import type { DungeonTheme } from './dungeonTheme';
import type { RoomTheme } from './roomTheme';
import type { ContentDefinition } from './content';
import { emptyContentSelection, resolveContentSelection, resolveRoomThemeSelection, resolveFactionSelection } from './themeSelection';
import type { DungeonDocument } from './types';
import { factionDisplayName } from './factionState';

export function resolveFaction(faction:FactionDraft,contents:readonly ContentDefinition[],roomThemes:readonly RoomTheme[],dungeonTheme?:DungeonTheme,roomTheme?:RoomTheme) {
  const base=resolveContentSelection({...emptyContentSelection(),...faction.memberSelection},contents),warnings=base.warnings.map(w=>w.message);
  const restrictions=[dungeonTheme,roomTheme].filter((t):t is DungeonTheme|RoomTheme=>!!t).map(t=>resolveContentSelection(t.contentSelection,contents));
  for(const r of restrictions)warnings.push(...r.warnings.map(w=>w.message));
  const members=Object.fromEntries((['monster','npc'] as const).map(kind=>{
    const candidates=intersectById(base.candidates[kind],restrictions.map(r=>r.candidates[kind]));
    if(base.candidates[kind].length&&!candidates.length)warnings.push(`${kind}: テーマとの共通候補がありません。`);return [kind,candidates];
  })) as Record<'monster'|'npc',ContentDefinition[]>;
  const preferred=resolveRoomThemeSelection(faction.roomThemeSelection,roomThemes);warnings.push(...preferred.warnings.map(w=>w.message));
  const allowed=dungeonTheme?resolveRoomThemeSelection(dungeonTheme.roomThemeSelection,roomThemes):null;
  if(allowed)warnings.push(...allowed.warnings.map(w=>w.message));
  const themes=intersectById(preferred.candidates,allowed?[allowed.candidates]:[]);
  if(preferred.candidates.length&&!themes.length)warnings.push('Dungeon Themeとの共通Room Theme候補がありません。');
  if(dungeonTheme&&!resolveFactionSelection(dungeonTheme.factionSelection,[faction]).candidates.length)warnings.push('この勢力はDungeon ThemeのFaction候補外です。手動での登録・利用は可能です。');
  return {members,roomThemes:themes,warnings:[...new Set(warnings)].sort()};
}
export function factionStatistics(dungeon:DungeonDocument,id:string) {
  const entities=dungeon.entities.filter(e=>e.factionId===id);
  const count=(kind:string)=>{const values=entities.filter(e=>e.contentSnapshot.kind===kind);return {groups:values.length,quantity:values.reduce((n,e)=>n+e.quantity,0)};};
  return {controlled:dungeon.roomFactionAssignments.filter(a=>a.controllingFactionId===id).length,contested:dungeon.roomFactionAssignments.filter(a=>a.contestingFactionIds.includes(id)).length,
    monster:count('monster'),npc:count('npc'),relations:dungeon.factionRelations.filter(r=>r.factionAId===id||r.factionBId===id).length};
}
/** Diagnostics never veto intentional infiltration, capture or unusual territory. */
export function factionDiagnostics(dungeon:DungeonDocument,contents:readonly ContentDefinition[]=[],roomThemes:readonly RoomTheme[]=[]) {
  const warnings:string[]=[];
  for(const room of dungeon.rooms) {
    const label=`部屋${room.information.number}`,assignment=dungeon.roomFactionAssignments.find(a=>a.roomId===room.id),entities=dungeon.entities.filter(e=>e.roomId===room.id),present=new Set(entities.flatMap(e=>e.factionId?[e.factionId]:[]));
    for(const relation of dungeon.factionRelations)if(relation.kind==='hostile'&&present.has(relation.factionAId)&&present.has(relation.factionBId))warnings.push(`${label}: 敵対する勢力のEntityが同居しています。`);
    for(const entity of entities)if(entity.factionId) {
      const faction=dungeon.factions.find(f=>f.id===entity.factionId)!;
      if(assignment?.status==='controlled'&&assignment.controllingFactionId!==entity.factionId)warnings.push(`${label}: 支配勢力とは異なる所属のEntity「${entity.customName||entity.contentSnapshot.name}」があります。`);
      const library=[...contents.filter(c=>c.id!==entity.sourceContentId),entity.contentSnapshot];
      const result=resolveFaction(faction.factionSnapshot,library,roomThemes,dungeon.theme?.themeSnapshot,room.roomTheme?.themeSnapshot);
      if(!result.members[entity.contentSnapshot.kind as 'monster'|'npc'].some(c=>c.id===entity.sourceContentId))warnings.push(`${label}: ${factionDisplayName(faction)}のEntityが構成候補外です。`);
    }
    if(assignment?.status==='controlled'&&room.roomTheme) {
      const f=dungeon.factions.find(f=>f.id===assignment.controllingFactionId)!;
      if(!resolveFaction(f.factionSnapshot,contents,[...roomThemes.filter(t=>t.id!==room.roomTheme!.sourceThemeId),room.roomTheme.themeSnapshot],dungeon.theme?.themeSnapshot).roomThemes.some(t=>t.id===room.roomTheme!.sourceThemeId))warnings.push(`${label}: 支配勢力の推奨Room Theme候補外です。`);
    }
  }
  return [...new Set(warnings)];
}
