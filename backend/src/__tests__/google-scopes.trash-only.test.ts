/**
 * Mail removal is trash-only (decided 2026-09-11).
 *
 * The phishing module's "remove from other mailboxes" moves a message to Trash
 * with gmail.modify, so a wrong call is recoverable for 30 days. Permanently
 * deleting a message (users.messages.delete / batchDelete) needs the full
 * `https://mail.google.com/` scope: total control of every mailbox in the
 * workspace. Helios never advertises, maps or mints it. If one of these tests
 * fails, someone is adding permanent delete; that is a recorded decision in the
 * north-star tracker first, not a code change.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { DELEGATION_SCOPES, googleScopesForPath } from '../config/google-scopes.js';

const FULL_MAIL = 'https://mail.google.com/';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') out.push(...sourceFiles(p));
    } else if (/\.(ts|js|json)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('mail removal is trash-only', () => {
  it('the full mail scope is never advertised for delegation', () => {
    expect(DELEGATION_SCOPES).not.toContain(FULL_MAIL);
  });

  it('no Gmail message call mints the full mail scope', () => {
    const calls: Array<[string, string]> = [
      ['POST', 'gmail/v1/users/u/messages/m1/trash'],
      ['POST', 'gmail/v1/users/u/messages/m1/untrash'],
      ['DELETE', 'gmail/v1/users/u/messages/m1'],
      ['POST', 'gmail/v1/users/u/messages/batchDelete'],
      ['GET', 'gmail/v1/users/u/messages'],
    ];
    for (const [method, path] of calls) {
      expect(googleScopesForPath(method, path).scopes).not.toContain(FULL_MAIL);
    }
  });

  it('no backend source builds a client with the full mail scope', () => {
    // Catches a service that hard-codes its own JWT scopes (as the Vault client
    // does for ediscovery) and so would bypass the canonical scope module.
    const offenders = sourceFiles(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes(FULL_MAIL))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
