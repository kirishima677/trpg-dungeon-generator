import type { PlacedRoom, PlacedRoomInput, RoomInformation } from './types';

export function emptyRoomInformation(number: string): RoomInformation {
  return { number, name: '', description: '', gmNotes: '', tags: [] };
}

export function normalizeRoomTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(t => t.trim()).filter(Boolean))];
}

/** Numbers are trimmed, case-sensitive strings. Decimal-only labels inform auto numbering. */
export function nextRoomNumber(numbers: Iterable<string>): string {
  let maximum = 0n;
  for (const number of numbers) if (/^\d+$/.test(number)) {
    const value = BigInt(number);
    if (value > maximum) maximum = value;
  }
  return (maximum + 1n).toString().padStart(2, '0');
}

export function roomInformationError(value: unknown, otherNumbers: Iterable<string> = []): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '部屋情報の形式が不正です。';
  const info = value as RoomInformation;
  if (typeof info.number !== 'string' || !info.number.trim()) return '部屋番号を入力してください。';
  for (const number of otherNumbers) if (number === info.number.trim()) return 'その部屋番号は既に使われています。';
  if (typeof info.name !== 'string' || typeof info.description !== 'string' || typeof info.gmNotes !== 'string'
    || !Array.isArray(info.tags) || info.tags.some(t => typeof t !== 'string')) return '名称・説明・GM専用情報は文字列、タグは文字列の配列で指定してください。';
  return null;
}

export function normalizeRoomInformation(value: unknown, number: string): RoomInformation {
  const info = value && typeof value === 'object' ? value as Partial<RoomInformation> : {};
  return { number, name: typeof info.name === 'string' ? info.name.trim() : '',
    description: typeof info.description === 'string' ? info.description : '',
    gmNotes: typeof info.gmNotes === 'string' ? info.gmNotes : '',
    tags: Array.isArray(info.tags) ? normalizeRoomTags(info.tags.filter((t): t is string => typeof t === 'string')) : [] };
}

/** Reserve valid legacy labels before filling gaps, preserving the first duplicate. */
export function normalizeRoomInformationList<T extends PlacedRoomInput>(rooms: readonly T[]): (T & PlacedRoom)[] {
  const used = new Set<string>();
  const numbers = rooms.map(room => {
    const number = typeof room.information?.number === 'string' ? room.information.number.trim() : '';
    if (!number || used.has(number)) return null;
    used.add(number); return number;
  });
  let next = nextRoomNumber(used);
  return rooms.map((room, index) => {
    const number = numbers[index] ?? next;
    if (numbers[index] === null) next = (BigInt(next) + 1n).toString().padStart(2, '0');
    return { ...room, information: normalizeRoomInformation(room.information, number) };
  });
}

export function roomDisplayName(room: PlacedRoomInput): string {
  return room.information?.name?.trim() || room.piece.name;
}

export function roomDisplayLabel(room: PlacedRoomInput): string {
  return [room.information?.number, roomDisplayName(room)].filter(Boolean).join(' ');
}
