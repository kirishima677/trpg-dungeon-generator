export const MARKDOWN_CHANNEL_NAME = 'trpg-dungeon-generator-markdown';

export interface MarkdownSavedEvent {
  type: 'MARKDOWN_SAVED';
  payload: {
    dungeonId: string;
    markdown: string;
    updatedAt: string;
  };
}

export type MarkdownChannelEvent = MarkdownSavedEvent;

export function isMarkdownSavedEvent(value: unknown): value is MarkdownSavedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<MarkdownSavedEvent>;
  return (
    event.type === 'MARKDOWN_SAVED' &&
    typeof event.payload?.dungeonId === 'string' &&
    typeof event.payload?.markdown === 'string' &&
    typeof event.payload?.updatedAt === 'string'
  );
}
