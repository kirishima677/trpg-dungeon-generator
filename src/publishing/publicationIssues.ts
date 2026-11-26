import type { PublishAudience } from './publishProfile';

const severity = {
  'unresolved-connections': 'warning', 'unsupported-connections': 'warning', 'excluded-corridors': 'warning',
  'incomplete-reconstruction': 'warning', 'insufficient-quantity': 'warning',
  'layout-profile': 'error', 'layout-total': 'error', 'layout-instances': 'error', 'layout-page': 'error',
  'layout-rotation': 'error', 'layout-dimensions': 'error', 'layout-bounds': 'error', 'layout-category': 'error',
  'layout-overlap': 'error', 'layout-missing': 'error', 'unplaced-pieces': 'error',
} as const;
export type PublicationIssueCode = keyof typeof severity;
export interface PublicationIssue {
  code: PublicationIssueCode; severity: 'warning' | 'error'; message: string; count?: number; audience?: PublishAudience;
}
export function publicationIssue(code: PublicationIssueCode, message: string, count?: number): PublicationIssue {
  return { code, severity: severity[code], message, ...(count === undefined ? {} : { count }) };
}
export const issueMessage = (issue: PublicationIssue) => `${issue.audience ? `${issue.audience.toUpperCase()}: ` : ''}${issue.message}`;
export const issueMessages = (issues: readonly PublicationIssue[]) => issues.map(issueMessage);
/** Oversized materials can be shown in a partial preview; all other layout errors block it. */
export const canPreviewPieceSheet = (issues: readonly PublicationIssue[]) => issues.every(issue => issue.code === 'unplaced-pieces');
export const needsAcknowledgement = (issues: readonly PublicationIssue[]) => issues.some(issue =>
  issue.code === 'unresolved-connections' || issue.code === 'unsupported-connections' || issue.code === 'excluded-corridors' || issue.code === 'incomplete-reconstruction');
export class PublicationIssueError extends Error {
  readonly issues: readonly PublicationIssue[];
  constructor(issues: readonly PublicationIssue[], suffix = '', prefix = '') {
    super(prefix + issueMessages(issues).join(' ') + suffix);
    this.name = 'PublicationIssueError'; this.issues = issues;
  }
}
export const publicationErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'マップの生成に失敗しました。';
export function unresolvedConnectionIssues(count: number) {
  return count ? [publicationIssue('unresolved-connections', `未解決の接続が${count}件あります。`, count)] : [];
}
