import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdownToHtml(markdown: string, publication = false): string {
  const renderedHtml = marked.parse(markdown, { async: false }) as string;
  if (!publication) return DOMPurify.sanitize(renderedHtml);
  // A standalone guide must never fetch images, styles, fonts or other resources.
  // An explicit tag/attribute allowlist also excludes SVG, IDs and hidden markup.
  return DOMPurify.sanitize(renderedHtml, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote',
      'pre', 'code', 'strong', 'em', 'del', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'sup', 'sub', 'kbd'],
    ALLOWED_ATTR: ['href', 'title', 'start', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|#)/i,
  });
}
