/**
 * Guards for the behaviours the 2026-09-07 live M365 capture run exposed
 * (fixtures: users.post.federated-400, assignLicense.post.usagelocation-400).
 */
import { describe, it, expect } from '@jest/globals';
import {
  chooseUpnDomain,
  withReplicationRetry,
  USAGE_LOCATION_REPLICATION_RE,
  type VerifiedDomain,
} from '../services/microsoft-graph.service.js';
import { graphSanitizeValue, makeGuidAliaser, makeDomainAliaser } from '../testing/graph-replay.js';
import { makeEmailAliaser } from '../testing/http-replay.js';

const domains: VerifiedDomain[] = [
  { name: 'corp.example', isDefault: true, isVerified: true, authenticationType: 'Federated' },
  { name: 'tenant.onmicrosoft.com', isDefault: false, isVerified: true, authenticationType: 'Managed' },
  { name: 'other.example', isDefault: false, isVerified: true, authenticationType: 'Managed' },
];

describe('chooseUpnDomain — federated domains cannot take cloud-created users', () => {
  it('uses the email domain when it is verified AND managed', () => {
    expect(chooseUpnDomain('other.example', domains)).toEqual({ domain: 'other.example', reason: null });
  });
  it('substitutes the first managed domain when the email domain is federated, and says why', () => {
    const r = chooseUpnDomain('corp.example', domains);
    expect(r.domain).toBe('tenant.onmicrosoft.com');
    expect(r.reason).toMatch(/federated/i);
  });
  it('prefers a managed DEFAULT domain over other managed domains', () => {
    const d: VerifiedDomain[] = [
      { name: 'a.example', isDefault: false, isVerified: true, authenticationType: 'Managed' },
      { name: 'b.example', isDefault: true, isVerified: true, authenticationType: 'Managed' },
    ];
    expect(chooseUpnDomain('unknown.example', d).domain).toBe('b.example');
  });
  it('falls back to the email domain (and no note) when no managed domain exists, so Graph reports the error', () => {
    const d: VerifiedDomain[] = [{ name: 'corp.example', isDefault: true, isVerified: true, authenticationType: 'Federated' }];
    expect(chooseUpnDomain('corp.example', d)).toEqual({ domain: 'corp.example', reason: null });
  });
});

describe('withReplicationRetry — usageLocation lag before assignLicense', () => {
  it('retries only the matching error and then succeeds', async () => {
    let calls = 0;
    const out = await withReplicationRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('License assignment cannot be done for user with invalid usage location.');
        return 'ok';
      },
      USAGE_LOCATION_REPLICATION_RE,
      { attempts: 5, delayMs: 0 },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });
  it('rethrows a non-matching error immediately', async () => {
    let calls = 0;
    await expect(
      withReplicationRetry(async () => { calls++; throw new Error('Insufficient privileges'); }, USAGE_LOCATION_REPLICATION_RE, { attempts: 5, delayMs: 0 }),
    ).rejects.toThrow('Insufficient privileges');
    expect(calls).toBe(1);
  });
  it('gives up after the configured attempts', async () => {
    let calls = 0;
    await expect(
      withReplicationRetry(async () => { calls++; throw new Error('invalid usage location'); }, USAGE_LOCATION_REPLICATION_RE, { attempts: 3, delayMs: 0 }),
    ).rejects.toThrow(/usage location/);
    expect(calls).toBe(3);
  });
});

describe('sanitizer — verifiedDomains keep their flags, companyName is redacted', () => {
  it('aliases domain names but preserves isDefault / isVerified / authenticationType', () => {
    const raw = {
      value: [{
        companyName: 'Real Company Inc',
        verifiedDomains: [
          { name: 'realcompany.ca', isDefault: true, isVerified: true, authenticationType: 'Federated', capabilities: 'Email, OfficeCommunicationsOnline' },
          { name: 'realcompanyca.onmicrosoft.com', isDefault: false, isVerified: true, authenticationType: 'Managed' },
        ],
      }],
    };
    const out: any = graphSanitizeValue(raw, makeEmailAliaser(), makeGuidAliaser(), makeDomainAliaser());
    const doms = out.value[0].verifiedDomains;
    expect(doms).toEqual([
      { name: 'domain-1.example', isDefault: true, isVerified: true, authenticationType: 'Federated', capabilities: 'Email, OfficeCommunicationsOnline' },
      { name: 'tenant.onmicrosoft.com', isDefault: false, isVerified: true, authenticationType: 'Managed' },
    ]);
    expect(out.value[0].companyName).toBe('REDACTED');
    expect(JSON.stringify(out)).not.toMatch(/realcompany/i);
  });
});
