/**
 * Plain text from an HTML fragment, for display as text (never as HTML).
 * Tags are removed repeatedly until none remain, so nested fragments such as
 * `<<b>script>` cannot leave a tag behind. Mirrors backend/src/utils/html-text.ts.
 */
export function stripHtmlTags(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  return text;
}
