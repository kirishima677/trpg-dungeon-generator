import EasyMDE from 'easymde';

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

function sanitizeMarkdownHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  for (const selector of FORBIDDEN_SELECTORS) {
    doc.querySelectorAll(selector).forEach(node => node.remove());
  }

  doc.querySelectorAll('*').forEach(node => {
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
        (value.startsWith('javascript:') || value.startsWith('data:text/html'))
      ) {
        node.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
}

export function renderMarkdownToHtml(markdown: string): string {
  const easyMDEPrototype = EasyMDE.prototype as unknown as {
    markdown: (text: string) => string;
  };
  const renderedHtml = easyMDEPrototype.markdown(markdown);
  return sanitizeMarkdownHtml(renderedHtml);
}
