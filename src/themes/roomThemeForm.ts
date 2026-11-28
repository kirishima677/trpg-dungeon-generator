import type { RoomThemeDraft, RequiredContentEntry, RoomPieceConstraints } from '../model/roomTheme';
import { ROOM_CONSTRAINT_FIELDS, normalizeRoomThemeDraft, normalizeRoomConstraints } from '../model/roomTheme';
import { fromEncounterPolicyForm,fromPolicyForms, policyList, toThemePolicyForm } from './themeForm';
import type { ThemePolicyForm } from './themeForm';
export interface RoomThemeForm extends ThemePolicyForm<RoomThemeDraft> {
  constraints: Record<keyof RoomPieceConstraints,string>;
  required: { entry: RequiredContentEntry; quantity: string }[];
}
export function toRoomThemeForm(value: RoomThemeDraft): RoomThemeForm {
  return { ...toThemePolicyForm(value), constraints:Object.fromEntries(ROOM_CONSTRAINT_FIELDS.map(f => [f,value.pieceConstraints[f] === undefined ? '' : String(value.pieceConstraints[f])])) as RoomThemeForm['constraints'],
    required:value.requiredContents.map(entry => ({ entry:structuredClone(entry),quantity:String(entry.quantity) })) };
}
export function fromRoomConstraintForm(form: RoomThemeForm): RoomPieceConstraints {
  const values: Record<string,number> = {};
  for (const field of ROOM_CONSTRAINT_FIELDS) if (form.constraints[field].trim()) {
    if (!/^\d+$/.test(form.constraints[field].trim())) throw new Error(`${field}は整数で指定してください。`);
    values[field] = Number(form.constraints[field]);
  }
  return normalizeRoomConstraints(values);
}
export function fromRequiredForm(form: RoomThemeForm) {
  return form.required.map(({entry,quantity}) => {
    if (!/^\d+$/.test(quantity.trim())) throw new Error('必須数量は1以上の整数で指定してください。');
    return { ...entry,quantity:Number(quantity) };
  });
}
export function fromRoomThemeForm(form: RoomThemeForm): RoomThemeDraft {
  return normalizeRoomThemeDraft({ ...form.theme,tags:policyList(form.tagsText),...fromPolicyForms(form),encounterSelection:fromEncounterPolicyForm(form.encounters),pieceConstraints:fromRoomConstraintForm(form),requiredContents:fromRequiredForm(form) });
}
