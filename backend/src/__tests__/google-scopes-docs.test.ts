/**
 * The scopes an admin is told to authorise must be the scopes Helios can use.
 *
 * They drifted (found 2026-09-11): the setup guide and the in-app knowledge-base
 * article both listed the 17 base scopes and none of the optional ones, so an admin
 * who followed either one authorised a set that could never run Vault holds, the
 * account-purpose attribute, calendar rooms and buildings, or the read-only relay.
 * Each of those then failed later with an unexplained `unauthorized_client`, far from
 * the page that caused it.
 *
 * The wizard reads the list from the code and is safe by construction; prose cannot,
 * so this test is the guard. Authorising the full set is correct and not
 * over-permissive in practice: Helios mints only the scopes a given call needs.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DELEGATION_SCOPES } from '../config/google-scopes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/** Every distinct Google scope URL mentioned in a document. */
function scopesIn(text: string): string[] {
  const found = text.match(/https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._-]+/g) || [];
  return [...new Set(found)].sort();
}

const expected = [...new Set(DELEGATION_SCOPES)].sort();

describe('the documented delegation scopes match the code', () => {
  it('the setup guide lists exactly the delegation set', () => {
    expect(scopesIn(read('docs/guides/GOOGLE-WORKSPACE-SETUP-GUIDE.md'))).toEqual(expected);
  });

  it('the in-app knowledge-base guide lists exactly the delegation set', () => {
    expect(scopesIn(read('backend/src/knowledge/content/guides.json'))).toEqual(expected);
  });
});
