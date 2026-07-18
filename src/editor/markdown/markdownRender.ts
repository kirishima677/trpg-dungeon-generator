import { marked } from 'marked';

const FORBIDDEN_SELECTORS = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
];

function hasBlockedProtocol(rawValue: string): boolean {
  const lowered = rawValue.trim().toLowerCase();
  let normalized = '';
  for (const ch of lowered) {
    const code = ch.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) continue;
    normalized += ch;
  }
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:')
  );
}

function sanitizeMarkdownHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const selector of FORBIDDEN_SELECTORS) {
    doc.querySelectorAll(selector).forEach(node => node.remove());
  }

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;

  while (node) {
    const attrs = [...node.attributes];
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        hasBlockedProtocol(value)
      ) {
        node.removeAttribute(attr.name);
      }
    }
    node = walker.nextNode() as Element | null;
  }

  return doc.body.innerHTML;
}

export function renderMarkdownToHtml(markdown: string): string {
  const renderedHtml = marked.parse(markdown, { async: false }) as string;
  return sanitizeMarkdownHtml(renderedHtml);
}
