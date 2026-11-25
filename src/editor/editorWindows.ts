const windows = new Map<string, Window>();

export function openEditorWindow(name: string, params: Record<string, string>, features: string): boolean {
  const existing = windows.get(name);
  if (existing && !existing.closed) { existing.focus(); return true; }
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(params).toString();
  const opened = window.open(url.toString(), name, features);
  if (!opened || opened === window) return false;
  windows.set(name, opened);
  opened.focus();
  return true;
}
