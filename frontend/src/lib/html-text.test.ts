import { describe, it, expect } from 'vitest';
import { stripHtmlTags } from './html-text';

describe('stripHtmlTags', () => {
  it('removes ordinary tags', () => {
    expect(stripHtmlTags('<p>Hello <b>there</b></p>')).toBe('Hello there');
  });

  it('leaves no tag behind from nested fragments', () => {
    expect(stripHtmlTags('<<b>script>alert(1)<</b>/script>')).not.toMatch(/<[a-z/]/i);
  });

  it('keeps a lone angle bracket as text', () => {
    expect(stripHtmlTags('a < b')).toBe('a < b');
  });
});
