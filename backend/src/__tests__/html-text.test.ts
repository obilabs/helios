import { describe, it, expect } from '@jest/globals';
import { stripHtmlTags, decodeBasicEntities } from '../utils/html-text.js';

describe('stripHtmlTags', () => {
  it('removes ordinary tags', () => {
    expect(stripHtmlTags('<p>Hello <b>there</b></p>')).toBe('Hello there');
  });

  it('leaves no tag behind from nested fragments', () => {
    expect(stripHtmlTags('<<b>script>alert(1)<</b>/script>')).not.toMatch(/<[a-z/]/i);
    expect(stripHtmlTags('<scr<i>ipt>x')).not.toMatch(/<script/i);
  });

  it('keeps a lone angle bracket as text', () => {
    expect(stripHtmlTags('a < b')).toBe('a < b');
  });
});

describe('decodeBasicEntities', () => {
  it('decodes the common entities', () => {
    expect(decodeBasicEntities('&lt;a&gt; &quot;x&quot; &#39;y&#39;&nbsp;&amp;')).toBe('<a> "x" \'y\' &');
  });

  it('decodes &amp; last, so an escaped entity stays literal text', () => {
    expect(decodeBasicEntities('&amp;lt;')).toBe('&lt;');
  });
});
