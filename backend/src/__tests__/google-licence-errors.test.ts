import { describe, it, expect } from '@jest/globals';
import {
  explainLicenceRefusal,
  isAutomaticLicensingRefusal,
  googleStatusOf,
  AUTOMATIC_LICENSING_PATH,
} from '../lib/google-licence-errors.js';

// What a real tenant answers (recorded fixture, and seen again on 2026-11-26).
const REAL = 'Combination of product and sku is invalid or the product has auto-assigned feature enabled';
// What Google's Licensing API guide documents.
const DOCUMENTED_REMOVE = 'Auto License un-assignment is not allowed';
const DOCUMENTED_SWITCH = 'Auto License switching is not allowed';

describe('isAutomaticLicensingRefusal', () => {
  it.each([REAL, DOCUMENTED_REMOVE, DOCUMENTED_SWITCH, 'auto license unassignment is not allowed'])(
    'recognises %j',
    (text) => {
      expect(isAutomaticLicensingRefusal(text)).toBe(true);
    }
  );

  it.each(['User does not have a license for specified sku and product', 'Not Authorized to access this resource/api', '', undefined])(
    'does not claim %j',
    (text) => {
      expect(isAutomaticLicensingRefusal(text as any)).toBe(false);
    }
  );
});

describe('explainLicenceRefusal', () => {
  it('explains the real 400 and the documented 412 the same way', () => {
    const real = explainLicenceRefusal('remove', REAL, 400);
    const documented = explainLicenceRefusal('remove', DOCUMENTED_REMOVE, 412);
    expect(real.reason).toBe('automatic_licensing');
    expect(documented.reason).toBe('automatic_licensing');
    expect(real.status).toBe(409);
    expect(documented.status).toBe(409);
    expect(real.message).toBe(documented.message);
    expect(real.googleStatus).toBe(400);
    expect(documented.googleStatus).toBe(412);
  });

  it('tells the admin where the setting is and what turning it off does', () => {
    const { message } = explainLicenceRefusal('remove', REAL, 400);
    expect(message).toContain(AUTOMATIC_LICENSING_PATH);
    expect(message).toContain('removed from one person');
    expect(message).toMatch(/keeps the licences people already have/);
    expect(message).not.toMatch(/Subscriptions/);
  });

  it('words an assignment differently from a removal', () => {
    expect(explainLicenceRefusal('assign', DOCUMENTED_SWITCH, 412).message).toContain('changed for one person');
  });

  it("passes on Google's own 4xx status and wording for any other refusal", () => {
    const r = explainLicenceRefusal('remove', 'User does not have a license for specified sku and product', 404);
    expect(r).toMatchObject({ status: 404, reason: 'google_refused', googleStatus: 404 });
    expect(r.message).toContain('User does not have a license');
  });

  it('reports a Google failure, or no status at all, as a bad gateway', () => {
    expect(explainLicenceRefusal('remove', 'Backend Error', 503).status).toBe(502);
    expect(explainLicenceRefusal('assign', 'socket hang up').status).toBe(502);
    expect(explainLicenceRefusal('assign', undefined).message).toContain('no reason given');
  });
});

describe('googleStatusOf', () => {
  it('reads the status wherever the Google client put it', () => {
    expect(googleStatusOf({ response: { status: 400 } })).toBe(400);
    expect(googleStatusOf({ code: 412 })).toBe(412);
    expect(googleStatusOf({ code: '404' })).toBe(404);
    expect(googleStatusOf({ status: 403 })).toBe(403);
  });

  it('ignores codes that are not HTTP statuses', () => {
    expect(googleStatusOf({ code: 'ECONNRESET' })).toBeUndefined();
    expect(googleStatusOf(undefined)).toBeUndefined();
  });
});
