import { newRoomTheme } from '../../src/model/roomTheme';
import type { RoomTheme,RequiredContentEntry } from '../../src/model/roomTheme';
import { CONTENT_KINDS } from '../../src/model/content';
import { contentFixture,entityTimestamp } from './entityFixture';
export function requiredFixture(id='altar',kind:typeof CONTENT_KINDS[number]='object'):RequiredContentEntry {
  return {id,contentId:contentFixture(kind).id,expectedKind:kind,quantity:4,customName:'祭壇',publicDescription:'祭壇の横に**銀の聖杯**。',gmNotes:'REQUIRED_PRIVATE_NOTES',visibility:'gm-only'};
}
export function roomThemeFixture(id='room-theme-chapel'):RoomTheme {
  const t:RoomTheme={...newRoomTheme(),id,name:'礼拝堂',genre:'fantasy',category:'religious',purpose:'宗教的儀式および礼拝',summary:'地下の聖堂',description:'## 典型的な構成\n**祭壇**',gmNotes:'ROOM_THEME_PRIVATE_GM',tags:['地下','religious'],createdAt:entityTimestamp,updatedAt:entityTimestamp};
  t.pieceSelection.mode='all';t.pieceConstraints={minCells:4,minConnectors:1};for(const kind of CONTENT_KINDS)t.contentSelection[kind].mode='all';
  t.requiredContents=[requiredFixture()];return t;
}
export function privateRoomTheme():RoomTheme {
  const t=roomThemeFixture('ROOM_THEME_PRIVATE_SOURCE');
  for(const f of ['name','genre','category','purpose','summary','description','gmNotes']as const)t[f]=`ROOM_THEME_PRIVATE_${f}`;
  t.tags=['ROOM_THEME_PRIVATE_TAG'];t.pieceSelection.includePieceIds=['ROOM_THEME_PRIVATE_PIECE'];t.contentSelection.npc.includeContentIds=['ROOM_THEME_PRIVATE_CONTENT'];return t;
}
