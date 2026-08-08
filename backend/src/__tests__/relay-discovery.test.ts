/**
 * Tests for the API relay discovery classifier.
 *
 * The property under test: valid denied endpoints become promotable library
 * hints; nonexistent endpoints and probing become anomalies that can never be
 * promoted; deliberate/authority/subject denials become neither. Pure — no network.
 */
import { describe, it, expect } from '@jest/globals';
import {
  classifyDenial,
  summarizeDenials,
  endpointsNeedingRefresh,
  type DenialEvent,
} from '../services/relay/discovery.js';

function ev(partial: Partial<DenialEvent>): DenialEvent {
  return {
    resource: 'admin.directory.users',
    method: 'GET',
    callerId: 'user1',
    timestamp: 0,
    known: true,
    reason: 'default-deny',
    ...partial,
  };
}

describe('classifyDenial', () => {
  it('known endpoint + default-deny => promotable library hint', () => {
    expect(classifyDenial(ev({ known: true, reason: 'default-deny' }))).toBe('library-hint');
  });

  it('known endpoint + delete-requires-explicit-rule => library hint (enable Delete)', () => {
    expect(classifyDenial(ev({ known: true, reason: 'delete-requires-explicit-rule' }))).toBe(
      'library-hint',
    );
  });

  it('nonexistent endpoint => anomaly, never a hint', () => {
    expect(classifyDenial(ev({ known: false, reason: 'default-deny' }))).toBe('anomaly');
  });

  it('org-deny (deliberate) => ignore, not a hint', () => {
    expect(classifyDenial(ev({ known: true, reason: 'org-deny' }))).toBe('ignore');
  });

  it('ceiling-exceeded (caller authority) => ignore', () => {
    expect(classifyDenial(ev({ known: true, reason: 'ceiling-exceeded' }))).toBe('ignore');
  });

  it('privileged-subject constraint => ignore (not a casual "enable this")', () => {
    expect(
      classifyDenial(ev({ known: true, reason: 'privileged-subject-requires-explicit-rule' })),
    ).toBe('ignore');
  });
});

describe('summarizeDenials', () => {
  it('dedupes hints by resource:method with a count and distinct callers', () => {
    const events = [
      ev({ callerId: 'a' }),
      ev({ callerId: 'b' }),
      ev({ callerId: 'a' }), // same caller again — count rises, callers stays distinct
    ];
    const { hints } = summarizeDenials(events);
    expect(hints).toHaveLength(1);
    expect(hints[0].count).toBe(3);
    expect(hints[0].callers.sort()).toEqual(['a', 'b']);
  });

  it('sorts hints by count descending', () => {
    const events = [
      ev({ resource: 'admin.directory.groups', method: 'GET' }),
      ev({ resource: 'admin.directory.users', method: 'GET' }),
      ev({ resource: 'admin.directory.users', method: 'GET' }),
    ];
    const { hints } = summarizeDenials(events);
    expect(hints[0].resource).toBe('admin.directory.users');
    expect(hints[0].count).toBe(2);
  });

  it('garbage never enters the hint queue', () => {
    const events = [ev({ known: false, resource: 'admin.directory.flooberize' })];
    const { hints, anomalies } = summarizeDenials(events);
    expect(hints).toHaveLength(0);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('unknown-endpoint');
  });

  it('flags a caller probing many distinct nonexistent endpoints', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev({ known: false, resource: `admin.directory.fake${i}`, callerId: 'attacker' }),
    );
    const { anomalies } = summarizeDenials(events, { probingDistinctEndpointThreshold: 5 });
    const probing = anomalies.find((a) => a.kind === 'probing');
    expect(probing).toBeDefined();
    expect(probing?.callerId).toBe('attacker');
    expect(probing?.count).toBe(6);
  });

  it('does not flag probing below the threshold', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      ev({ known: false, resource: `admin.directory.fake${i}`, callerId: 'user1' }),
    );
    const { anomalies } = summarizeDenials(events, { probingDistinctEndpointThreshold: 5 });
    expect(anomalies.some((a) => a.kind === 'probing')).toBe(false);
  });

  it('ignored denials contribute to neither queue', () => {
    const events = [
      ev({ reason: 'org-deny' }),
      ev({ reason: 'ceiling-exceeded' }),
    ];
    const { hints, anomalies } = summarizeDenials(events);
    expect(hints).toHaveLength(0);
    expect(anomalies).toHaveLength(0);
  });
});

describe('endpointsNeedingRefresh (catalogue self-heal)', () => {
  it('flags a repeatedly-hit unknown endpoint (likely a real new endpoint)', () => {
    const events = Array.from({ length: 3 }, () =>
      ev({ known: false, resource: 'admin.directory.newthing', method: 'GET' }),
    );
    expect(endpointsNeedingRefresh(events, 3)).toEqual(['admin.directory.newthing:GET']);
  });

  it('does not flag scattered one-off garbage', () => {
    const events = [
      ev({ known: false, resource: 'admin.directory.fake1' }),
      ev({ known: false, resource: 'admin.directory.fake2' }),
    ];
    expect(endpointsNeedingRefresh(events, 3)).toEqual([]);
  });

  it('ignores known endpoints (they need no refresh)', () => {
    const events = Array.from({ length: 5 }, () => ev({ known: true }));
    expect(endpointsNeedingRefresh(events, 3)).toEqual([]);
  });
});
