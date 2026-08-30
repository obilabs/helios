/**
 * Unit tests for the pure helpers of the THROWAWAY M365 -> Google migration PoC.
 *
 * Zero external deps: uses Node's built-in test runner + assert so it runs with
 * `node --test` or `npx tsx --test scripts/migrate-m365-to-google.test.ts`
 * without vitest/jest configured at the repo root. These cover only the pure,
 * side-effect-free helpers (the network paths need a live tenant and are out of
 * scope for a unit test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  base64url,
  seg,
  withQuery,
  graphPathFromNextLink,
  oneDriveFolderSegments,
  buildGmailImportRequest,
  buildMultipartRelated,
  emptyCheckpoint,
  isMailDone,
  isFileDone,
  parseArgs,
  parseIdentityMap,
} from './migrate-m365-to-google.ts';

test('base64url encodes strings without padding', () => {
  assert.equal(base64url('hello'), 'aGVsbG8'); // "aGVsbG8=" with '=' stripped
  assert.equal(base64url(''), '');
});

test('base64url is URL-safe (+/ -> -_)', () => {
  // Bytes 0xFB 0xFF -> base64 "+/8=" -> base64url "-_8"
  assert.equal(base64url(Buffer.from([0xfb, 0xff])), '-_8');
});

test('seg encodes @ and + in path segments', () => {
  assert.equal(seg('a+b@c.com'), 'a%2Bb%40c.com');
});

test('withQuery skips null/undefined and preserves order', () => {
  assert.equal(withQuery('/p', { a: 1, b: undefined, c: null, d: 'x' }), '/p?a=1&d=x');
  assert.equal(withQuery('/p'), '/p');
  assert.equal(withQuery('/p', {}), '/p');
});

test('graphPathFromNextLink strips the graph host, keeps path+query', () => {
  assert.equal(
    graphPathFromNextLink('https://graph.microsoft.com/v1.0/users/u/messages?$skip=10&$top=50'),
    'v1.0/users/u/messages?$skip=10&$top=50',
  );
  assert.equal(
    graphPathFromNextLink('https://graph.microsoft.com/v1.0/drives/d/items/i/children?$skiptoken=abc'),
    'v1.0/drives/d/items/i/children?$skiptoken=abc',
  );
});

test('oneDriveFolderSegments parses parentReference.path after root:', () => {
  assert.deepEqual(oneDriveFolderSegments('/drive/root:/Projects/2026'), ['Projects', '2026']);
  assert.deepEqual(oneDriveFolderSegments('/drive/root:'), []);
  assert.deepEqual(oneDriveFolderSegments('/drive/root:/'), []);
  assert.deepEqual(oneDriveFolderSegments('/drives/b!xyz/root:/A'), ['A']);
  assert.deepEqual(oneDriveFolderSegments(undefined), []);
  // URL-encoded segment is decoded
  assert.deepEqual(oneDriveFolderSegments('/drive/root:/My%20Docs'), ['My Docs']);
});

test('buildGmailImportRequest matches the gmailImport builder shape', () => {
  const req = buildGmailImportRequest('user@newdomain.com', 'RAWDATA');
  assert.equal(req.method, 'POST');
  assert.equal(
    req.path,
    '/api/google/gmail/v1/users/user%40newdomain.com/messages/import?internalDateSource=dateHeader&neverMarkSpam=true',
  );
  assert.deepEqual(req.body, { raw: 'RAWDATA' });
  assert.equal(req.impersonate, 'user@newdomain.com');
});

test('buildGmailImportRequest omits impersonation for a non-email target', () => {
  const req = buildGmailImportRequest('me', 'X');
  assert.equal(req.impersonate, undefined);
});

test('buildMultipartRelated builds a binary-safe multipart/related body', () => {
  const content = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
  const mp = buildMultipartRelated({ name: 'f.bin', parents: ['root'] }, 'application/octet-stream', content);

  assert.ok(mp.contentType.startsWith('multipart/related; boundary='));
  assert.ok(mp.contentType.includes(mp.boundary));
  assert.ok(Buffer.isBuffer(mp.body));

  const asText = mp.body.toString('latin1');
  assert.ok(asText.includes(`--${mp.boundary}`), 'opening boundary present');
  assert.ok(asText.includes('"name":"f.bin"'), 'metadata JSON present');
  assert.ok(asText.includes('Content-Type: application/json; charset=UTF-8'), 'metadata content-type');
  assert.ok(asText.includes('Content-Type: application/octet-stream'), 'media content-type');
  assert.ok(asText.endsWith(`--${mp.boundary}--`), 'closing boundary present');

  // The raw bytes survive verbatim (this is the whole point of not stringifying).
  const idx = mp.body.indexOf(content);
  assert.ok(idx !== -1, 'binary content is embedded byte-for-byte');
});

test('checkpoint idempotency: mark then isDone', () => {
  const cp = emptyCheckpoint();
  assert.equal(isMailDone(cp, '<id@x>'), false);
  cp.mail['<id@x>'] = { graphId: 'g1', at: 'now' };
  assert.equal(isMailDone(cp, '<id@x>'), true);
  assert.equal(isMailDone(cp, '<other@x>'), false);

  assert.equal(isFileDone(cp, 'item1'), false);
  cp.files['item1'] = { name: 'f', path: '/f', at: 'now' };
  assert.equal(isFileDone(cp, 'item1'), true);
  assert.equal(isFileDone(cp, 'item2'), false);
});

test('parseArgs handles --flag value, --flag=value, and boolean --flag', () => {
  const { flags, bools } = parseArgs(['--source', 'a@b.com', '--target=c@d.com', '--execute', '--max-files', '5']);
  assert.equal(flags.source, 'a@b.com');
  assert.equal(flags.target, 'c@d.com');
  assert.equal(flags['max-files'], '5');
  assert.ok(bools.has('execute'));
});

test('parseIdentityMap accepts JSON and a=b,c=d forms', () => {
  assert.deepEqual(parseIdentityMap('{"a@x":"b@y"}'), { 'a@x': 'b@y' });
  assert.deepEqual(parseIdentityMap('a@x=b@y, c@x=d@y'), { 'a@x': 'b@y', 'c@x': 'd@y' });
  assert.deepEqual(parseIdentityMap(undefined), {});
});
