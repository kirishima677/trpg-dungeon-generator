import {normalizeEncounterDraft} from '../model/encounter/template';
import type {EncounterTemplateDraft,EncounterFactionRole,EncounterContentEntry} from '../model/encounter/template';
import {emptyContentSelection,emptyPieceSelection,emptyEncounterSelection,normalizeKindSelection} from '../model/themeSelection';
import type {ThemePolicyForm,PolicyForm} from '../themes/themeForm';
import {toThemePolicyForm,toPolicyForm,policyList,fromRoomThemePolicyForm,fromDungeonThemePolicyForm,fromFactionPolicyForm} from '../themes/themeForm';
export interface EncounterForm extends ThemePolicyForm<EncounterTemplateDraft> {
 dungeonPolicy:PolicyForm;roomPolicy:PolicyForm;constraints:Record<'minRoomCells'|'maxRoomCells'|'minConnectedRooms'|'maxConnectedRooms',string>;
 roles:{role:EncounterFactionRole;policy:PolicyForm}[];
 entries:{entry:EncounterContentEntry;policy:PolicyForm;min:string;max:string}[];
}
export function toEncounterForm(value:EncounterTemplateDraft):EncounterForm {
 const f=toThemePolicyForm({...value,pieceSelection:emptyPieceSelection(),contentSelection:emptyContentSelection(),encounterSelection:emptyEncounterSelection()});
 return {...f,theme:structuredClone(value),dungeonPolicy:toPolicyForm(value.applicability.dungeonThemeSelection),roomPolicy:toPolicyForm(value.applicability.roomThemeSelection),constraints:Object.fromEntries((['minRoomCells','maxRoomCells','minConnectedRooms','maxConnectedRooms'] as const).map(k=>[k,value.applicability[k]===undefined?'':String(value.applicability[k])])) as EncounterForm['constraints'],roles:value.factionRoles.map(role=>({role:structuredClone(role),policy:toPolicyForm(role.factionSelection)})),entries:value.entries.map(entry=>({entry:structuredClone(entry),policy:toPolicyForm(entry.source.mode==='selection'?entry.source.selection:emptyContentSelection().monster),min:String(entry.quantity.min),max:String(entry.quantity.max)}))};
}
export function fromEntryPolicy(form:PolicyForm) {return normalizeKindSelection({mode:form.mode,includeContentIds:policyList(form.include,true),excludeContentIds:policyList(form.exclude,true),tags:{allOf:policyList(form.allOf),anyOf:policyList(form.anyOf),noneOf:policyList(form.noneOf)}});}
export function fromEncounterForm(f:EncounterForm):EncounterTemplateDraft {
 const limits:Record<string,number>={};for(const [k,v]of Object.entries(f.constraints))if(v.trim()){if(!/^\d+$/.test(v.trim()))throw new Error(`${k}は整数で指定してください。`);limits[k]=Number(v);}
 return normalizeEncounterDraft({...f.theme,tags:policyList(f.tagsText),applicability:{allowedControlStatuses:f.theme.applicability.allowedControlStatuses,...limits,dungeonThemeSelection:fromDungeonThemePolicyForm(f.dungeonPolicy),roomThemeSelection:fromRoomThemePolicyForm(f.roomPolicy)},factionRoles:f.roles.map(({role,policy})=>({...role,factionSelection:fromFactionPolicyForm(policy)})),entries:f.entries.map(({entry,policy,min,max})=>({...entry,quantity:{min:/^\d+$/.test(min.trim())?Number(min):NaN,max:/^\d+$/.test(max.trim())?Number(max):NaN},source:entry.source.mode==='fixed'?entry.source:{mode:'selection',selection:fromEntryPolicy(policy)}}))});
}
