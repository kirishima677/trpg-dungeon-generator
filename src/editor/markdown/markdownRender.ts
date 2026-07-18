import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdownToHtml(markdown: string): string {
  const renderedHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(renderedHtml);
}
