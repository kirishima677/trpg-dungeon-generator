/** srcdoc otherwise resolves fragment links against the parent app's URL.
 * Adapt only navigation targets; the exported document and its content stay intact.
 */
export function scenarioPreviewHtml(html: string): string {
  return html.replace(/href="#(guide-[a-z0-9-]+)"/g, 'href="about:srcdoc#$1"');
}
