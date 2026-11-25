import type { ScenarioGuideOptions } from '../../publishing/scenario/scenarioGuide';
import type { PublishAudience } from '../../publishing/publishProfile';

export function ScenarioGuideSettings({ audience, options, disabled, onChange }: {
  audience: PublishAudience; options: ScenarioGuideOptions; disabled: boolean;
  onChange: (options: ScenarioGuideOptions) => void;
}) {
  const controls = [
    ['includeMap', 'マップを含める'], ['includeTableOfContents', '目次を含める'], ['includeRoomDescriptions', '公開説明を含める'],
    ...(audience === 'gm' ? [['includeScenarioMarkdown', 'シナリオ概要を含める'], ['includeGmNotes', 'GM専用情報を含める'], ['includeRoomTags', 'タグを含める']] : []),
  ] as [keyof ScenarioGuideOptions, string][];
  return <fieldset disabled={disabled}><legend>シナリオガイド設定</legend>
    {controls.map(([key, label]) => <label key={key} className="publish-checkbox"><input type="checkbox" checked={options[key]}
      onChange={e => onChange({ ...options, [key]: e.target.checked })} />{label}</label>)}
  </fieldset>;
}
