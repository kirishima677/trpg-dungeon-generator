import { useCallback, useReducer } from 'react';
import type { SetStateAction } from 'react';
import { defaultPublishProfile } from '../../publishing/publishProfile';
import type { PublishProfile } from '../../publishing/publishProfile';
import { defaultPrintProfile } from '../../publishing/print/printProfile';
import { defaultScenarioGuideOptions } from '../../publishing/scenario/scenarioGuide';
import { defaultPieceSheetSelection } from '../../publishing/pieceSheet/inventory';
import { defaultPackageProfile } from '../../publishing/package/packagePlan';

function initialSettings() {
  return { profile: defaultPublishProfile(), printProfile: defaultPrintProfile(),
    guideProfiles: { player: defaultScenarioGuideOptions('player'), gm: defaultScenarioGuideOptions('gm') },
    sheetSelection: defaultPieceSheetSelection(), packageProfile: defaultPackageProfile(),
    view: 'map' as 'map' | 'guide' | 'print' | 'pieces' | 'package', preset: '64', zoom: 100, printPage: 0, allowUnresolved: false };
}
type Settings = ReturnType<typeof initialSettings>;
/** User settings survive tab changes. Snapshot refresh is a distinct, testable transition. */
export function usePublicationSettings() {
  const [state, dispatch] = useReducer((current: Settings, transition: (current: Settings) => Settings) => transition(current), undefined, initialSettings);
  const set = <K extends keyof Settings>(key: K, value: SetStateAction<Settings[K]>) => dispatch(s => ({ ...s,
    [key]: typeof value === 'function' ? (value as (previous: Settings[K]) => Settings[K])(s[key]) : value }));
  const refresh = useCallback(() => dispatch(s => ({ ...s, allowUnresolved: false,
    sheetSelection: s.sheetSelection.options.source === 'dungeon' ? { ...s.sheetSelection, quantities: {} } : s.sheetSelection })), []);
  const updateProfile = (patch: Partial<PublishProfile>) => dispatch(s => ({ ...s, profile: { ...s.profile, ...patch },
    allowUnresolved: patch.audience ? false : s.allowUnresolved }));
  const setGuideOptions = (options: Settings['guideProfiles']['player']) => dispatch(s => ({ ...s,
    guideProfiles: { ...s.guideProfiles, [s.profile.audience]: options } }));
  return { ...state, guideOptions: state.guideProfiles[state.profile.audience], refresh, updateProfile, setGuideOptions,
    setView: (v: Settings['view']) => set('view', v), setPrintProfile: (v: Settings['printProfile']) => set('printProfile', v),
    setSheetSelection: (v: SetStateAction<Settings['sheetSelection']>) => set('sheetSelection', v),
    setPackageProfile: (v: SetStateAction<Settings['packageProfile']>) => set('packageProfile', v),
    setPrintPage: (v: number) => set('printPage', v), setPreset: (v: string) => set('preset', v),
    setZoom: (v: number) => set('zoom', v), setAllowUnresolved: (v: boolean) => set('allowUnresolved', v) };
}
export type PublicationSettings = ReturnType<typeof usePublicationSettings>;
