export function formatStringList(values: readonly string[]): string {
  return values.map(value => /[,、\r\n"]/.test(value) || value.trim() !== value ? `"${value.replaceAll('"', '""')}"` : value).join(', ');
}
/** CSV-style quoted values retain delimiters and whitespace in opaque IDs; ordinary values are trimmed. */
export function parseStringList(text: string, label = 'タグ'): string[] {
  const result: string[] = []; let value = '', quoted = false, closed = false, wasQuoted = false;
  const finish = () => { result.push(wasQuoted ? value : value.trim()); value = ''; closed = false; wasQuoted = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; }
      } else value += char;
    } else if (/[,、\r\n]/.test(char)) finish();
    else if (closed) { if (char.trim()) throw new Error(`${label}の引用符の後はカンマで区切ってください。`); }
    else if (char === '"' && !value.trim()) { value = ''; quoted = true; wasQuoted = true; }
    else value += char;
  }
  if (quoted) throw new Error(`${label}の引用符を閉じてください。`);
  finish(); return result;
}
