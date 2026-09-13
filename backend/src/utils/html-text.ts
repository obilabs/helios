/**
 * Plain-text rendering of an HTML fragment (email text parts, signature
 * previews). The output is text, never HTML.
 *
 * Tags are removed repeatedly until none remain, so nested or overlapping
 * fragments such as `<<b>script>` cannot leave a tag behind after one pass.
 * Entities are decoded afterwards, with `&amp;` last so `&amp;lt;` becomes the
 * literal text `&lt;`.
 */
export function stripHtmlTags(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  // A lone `<` left over (e.g. "a < b" or an unterminated tag) is kept as text.
  return text;
}

export function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
