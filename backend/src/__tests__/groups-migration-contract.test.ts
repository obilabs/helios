/**
 * What the Groups Migration API actually does, captured from the obilabs.dev trial on
 * 2026-09-12 — hours before the trial was deleted, so this is the only copy.
 *
 * Why it was tested: a shared mailbox can become a free Google Group instead of a
 * licensed Google account, but only if its history comes across. Google's Data
 * Migration Service does not do that; this API does, into the group's ARCHIVE.
 *
 * Proven live, in the Groups web view:
 *   - the original Date header survives (messages from March and November 2024 show
 *     those dates, not the import time)
 *   - threading survives (In-Reply-To / References kept three messages in one
 *     conversation)
 *   - the sender survives, including addresses outside the tenant
 *   - UTF-8 subjects and bodies survive
 *   - members read the archive; nothing is delivered to their inboxes
 *
 * Two setup steps, not one: the `apps.groups.migration` scope on the delegation AND
 * the Groups Migration API enabled in the service account's own Cloud project.
 *
 * The trap this pins: a MALFORMED message is rejected with 503 "backend error", not a
 * 4xx. An importer that retries 503 as a transient fault will retry that message for
 * ever. Retry on 503 only with a bounded count, and treat a message that keeps failing
 * as bad input to report, not to retry.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(HERE, 'fixtures', 'google', 'groupsmigration', `${name}.json`), 'utf8'));

describe('Groups Migration API contract (recorded live)', () => {
  it('accepts a well-formed RFC822 message into the archive', () => {
    const f = fixture('archive.insert.success');
    expect(f.request.method).toBe('POST');
    expect(f.request.host).toBe('groupsmigration.googleapis.com');
    expect(f.request.contentType).toBe('message/rfc822');
    expect(f.request.query.uploadType).toBe('media');
    expect(f.response.status).toBe(200);
    expect(f.response.data.responseCode).toBe('SUCCESS');
  });

  it('answers 404 when the destination group does not exist', () => {
    const f = fixture('archive.insert.unknown-group');
    expect(f.response.status).toBe(404);
    expect(f.response.data.error.errors[0].reason).toBe('notFound');
  });

  it('answers 503, NOT a 4xx, when the message itself is malformed', () => {
    const f = fixture('archive.insert.malformed');
    expect(f.response.status).toBe(503);
    // Reads like a transient backend fault and is not one: the same input fails again.
    expect(String(f.response.data.error.message)).toMatch(/backend error/i);
  });

  it('carries no real identifiers', () => {
    const all = ['archive.insert.success', 'archive.insert.unknown-group', 'archive.insert.malformed']
      .map((n) => JSON.stringify(fixture(n)))
      .join('\n');
    expect(all).not.toMatch(/obilabs|gridworx|tmscanada|gmail\.com/i);
  });
});
