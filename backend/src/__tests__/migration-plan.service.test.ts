import {
  MigrationPlanService,
  MigrationPlan,
  MigrationTarget,
} from '../services/migration/migration-plan.service.js';

const svc = new MigrationPlanService();

function target(over: Partial<MigrationTarget> = {}): MigrationTarget {
  return {
    sourceMs365Id: 'ms1',
    sourceUpn: 'u@old.onmicrosoft.com',
    sourceEmail: 'u@old.com',
    sourceName: 'U',
    targetGoogleEmail: null,
    targetExists: false,
    transfer: { mail: true, drive: true, calendar: true, contacts: true },
    destinationType: 'mailbox',
    status: 'unmapped',
    ...over,
  };
}

function plan(targets: MigrationTarget[]): MigrationPlan {
  return { organizationId: 'org1', generatedAt: '2026-01-01T00:00:00.000Z', targets };
}

describe('MigrationPlanService.validatePlan', () => {
  it('flags unmapped targets and counts ready ones', () => {
    const v = svc.validatePlan(
      plan([
        target(),
        target({
          sourceEmail: 'v@old.com',
          targetGoogleEmail: 'v@new.com',
          targetExists: true,
          status: 'ready',
        }),
      ]),
    );
    expect(v.unmapped).toEqual(['u@old.com']);
    expect(v.readyCount).toBe(1);
    expect(v.ok).toBe(false);
  });

  it('flags a chosen destination that does not exist yet (must be created + licensed)', () => {
    const v = svc.validatePlan(
      plan([target({ targetGoogleEmail: 'y@new.com', targetExists: false, status: 'ready' })]),
    );
    expect(v.missingDestination).toEqual(['u@old.com -> y@new.com']);
    expect(v.ok).toBe(false);
  });

  it('is ok when every target has an existing destination', () => {
    const v = svc.validatePlan(
      plan([target({ targetGoogleEmail: 'u@new.com', targetExists: true, status: 'ready' })]),
    );
    expect(v.ok).toBe(true);
    expect(v.readyCount).toBe(1);
  });
});

describe('MigrationPlanService.toScriptMap', () => {
  it('includes only ready+existing targets, keyed by source UPN', () => {
    const m = svc.toScriptMap(
      plan([
        target({
          sourceUpn: 'a@old',
          sourceEmail: 'a@old.com',
          targetGoogleEmail: 'a@new.com',
          targetExists: true,
          status: 'ready',
        }),
        // chosen but destination missing -> excluded (never import into a non-existent mailbox)
        target({
          sourceUpn: 'b@old',
          sourceEmail: 'b@old.com',
          targetGoogleEmail: 'b@new.com',
          targetExists: false,
          status: 'ready',
        }),
        // unmapped -> excluded
        target({ sourceUpn: 'c@old', sourceEmail: 'c@old.com' }),
      ]),
    );
    expect(m).toEqual({ 'a@old': 'a@new.com' });
  });

  it('supports migrating source X into a DIFFERENT user Y', () => {
    const m = svc.toScriptMap(
      plan([
        target({
          sourceUpn: 'x@old',
          sourceEmail: 'x@old.com',
          targetGoogleEmail: 'manager@new.com',
          targetExists: true,
          status: 'ready',
        }),
      ]),
    );
    expect(m).toEqual({ 'x@old': 'manager@new.com' });
  });
});

describe('MigrationPlanService.toGoogleMigrationCsv', () => {
  it('includes ready mailbox/delegated targets and EXCLUDES group destinations', () => {
    const csv = svc.toGoogleMigrationCsv(
      plan([
        target({ sourceEmail: 'a@old.com', targetGoogleEmail: 'a@new.com', targetExists: true, status: 'ready', destinationType: 'mailbox' }),
        target({ sourceEmail: 'shared@old.com', targetGoogleEmail: 'shared@new.com', targetExists: true, status: 'ready', destinationType: 'delegated' }),
        // group = no history import -> excluded from the Google import CSV
        target({ sourceEmail: 'info@old.com', targetGoogleEmail: 'info@new.com', targetExists: true, status: 'ready', destinationType: 'group' }),
        // unmapped / not-yet-existing -> excluded
        target({ sourceEmail: 'z@old.com' }),
      ]),
    );
    expect(csv).toBe(
      'Source Email,Destination Email\n' +
        'a@old.com,a@new.com\n' +
        'shared@old.com,shared@new.com\n',
    );
  });
});
