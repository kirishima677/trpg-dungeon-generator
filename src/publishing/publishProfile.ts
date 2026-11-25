export type PublishAudience = 'player' | 'gm';
export interface PublishProfile {
  audience: PublishAudience;
  showGrid: boolean;
  showRoomNumbers: boolean;
  showRoomNames: boolean;
  background: 'white' | 'transparent';
  pixelsPerCell: number;
  paddingCells: number;
}
export const MAX_PIXELS_PER_CELL = 512;
export const MAX_PADDING_CELLS = 100;
export function defaultPublishProfile(audience: PublishAudience = 'player'): PublishProfile {
  return { audience, showGrid: true, showRoomNumbers: audience === 'gm', showRoomNames: audience === 'gm',
    background: 'white', pixelsPerCell: 64, paddingCells: 2 };
}
export function validatePublishProfile(profile: PublishProfile): void {
  if (!profile || !['player', 'gm'].includes(profile.audience)
    || !['white', 'transparent'].includes(profile.background)
    || [profile.showGrid, profile.showRoomNumbers, profile.showRoomNames].some(v => typeof v !== 'boolean')
    || !Number.isInteger(profile.pixelsPerCell) || profile.pixelsPerCell < 1 || profile.pixelsPerCell > MAX_PIXELS_PER_CELL
    || !Number.isFinite(profile.paddingCells) || profile.paddingCells < 0 || profile.paddingCells > MAX_PADDING_CELLS) {
    throw new Error(`出力設定が不正です。解像度は1〜${MAX_PIXELS_PER_CELL}px、余白は0〜${MAX_PADDING_CELLS}マスで指定してください。`);
  }
}
