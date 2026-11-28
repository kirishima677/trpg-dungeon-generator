/** Machine-readable diagnostics; messages remain presentation text. */
export interface Diagnostic<Code extends string = string> {
  code: Code;
  severity: 'error' | 'warning' | 'info';
  category: 'structure' | 'reference' | 'condition' | 'material' | 'evaluation';
  message: string;
  context?: { roomId?: string; entityId?: string; factionId?: string; encounterId?: string; roleId?: string; entryId?: string };
}
