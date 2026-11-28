import type { FactionDraft } from '../model/faction';
import { normalizeFactionDraft } from '../model/faction';
import { emptyContentSelection,emptyPieceSelection } from '../model/themeSelection';
import type { ThemePolicyForm,PolicyForm } from '../themes/themeForm';
import { toThemePolicyForm,toPolicyForm,fromEncounterPolicyForm,fromPolicyForms,policyList,fromRoomThemePolicyForm } from '../themes/themeForm';
export interface FactionForm extends ThemePolicyForm<FactionDraft> {roomThemes:PolicyForm}
export function toFactionForm(value:FactionDraft):FactionForm {
  const form=toThemePolicyForm({...value,pieceSelection:emptyPieceSelection(),contentSelection:{...emptyContentSelection(),...value.memberSelection}});
  return {...form,theme:structuredClone(value),roomThemes:toPolicyForm(value.roomThemeSelection)};
}
export function fromFactionForm(form:FactionForm):FactionDraft {
  const {monster,npc}=fromPolicyForms(form).contentSelection;
  return normalizeFactionDraft({...form.theme,tags:policyList(form.tagsText),encounterSelection:fromEncounterPolicyForm(form.encounters),memberSelection:{monster,npc},roomThemeSelection:fromRoomThemePolicyForm(form.roomThemes)});
}
