import { describe, it, expect } from 'vitest';
import {
  buildOffboardConfigPayload,
  DEFAULT_VACATION_MESSAGE,
} from './offboardConfig';

/**
 * These tests assert that the `gw offboard` console command builds the CORRECT
 * orchestrator payload from its flags. The payload is what the console POSTs to
 * POST /api/v1/lifecycle/offboard (the audited + guarded engine). No network is
 * involved — the builder is a pure function over a parsed flag map.
 *
 * The flag map mimics the console's parseArgs output: a value-less flag such as
 * `--suspend` maps to the empty string, while `--forward=x` maps to `'x'`.
 */

const USER = 'departing@corp.com';

describe('buildOffboardConfigPayload', () => {
  it('defaults to SUSPEND (never delete) with no data actions when no flags are given', () => {
    const cfg = buildOffboardConfigPayload(USER, {});
    expect(cfg).toEqual({
      userEmail: USER,
      driveAction: 'keep',
      emailAction: 'keep',
      accountAction: 'suspend_immediately',
      deleteAccount: false,
    });
    // Suspend is the default; nothing destructive or irreversible is implied.
    expect(cfg.deleteImmediately).toBeUndefined();
  });

  it('--suspend is an explicit no-op over the default (still suspend, never delete)', () => {
    const cfg = buildOffboardConfigPayload(USER, { suspend: '' });
    expect(cfg.accountAction).toBe('suspend_immediately');
    expect(cfg.deleteAccount).toBe(false);
    expect(cfg.deleteImmediately).toBeUndefined();
  });

  it('--delete opts into guarded immediate deletion but STILL suspends first', () => {
    const cfg = buildOffboardConfigPayload(USER, { delete: '' });
    expect(cfg.deleteAccount).toBe(true);
    expect(cfg.deleteImmediately).toBe(true);
    // Suspend-before-delete: a failed delete leaves the account suspended.
    expect(cfg.accountAction).toBe('suspend_immediately');
  });

  it('--transfer-drive transfers Drive to the manager', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      manager: 'boss@corp.com',
      'transfer-drive': '',
    });
    expect(cfg.driveAction).toBe('transfer_manager');
    expect(cfg.managerEmail).toBe('boss@corp.com');
    // No mail handover was requested, so mail is left untouched.
    expect(cfg.emailAction).toBe('keep');
    expect(cfg.emailForwardAddress).toBeUndefined();
  });

  it('--transfer-calendar folds Calendar into the transfer (also implies a drive transfer)', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      manager: 'boss@corp.com',
      'transfer-calendar': '',
    });
    expect(cfg.calendarTransferMeetingOwnership).toBe(true);
    expect(cfg.driveAction).toBe('transfer_manager');
  });

  it('--cancel-events cancels future events instead of transferring the calendar', () => {
    const cfg = buildOffboardConfigPayload(USER, { 'cancel-events': '' });
    expect(cfg.cancelFutureEvents).toBe(true);
    expect(cfg.calendarTransferMeetingOwnership).toBeUndefined();
  });

  it('--forward sets the forward address and delegates the mailbox to it by default', () => {
    const cfg = buildOffboardConfigPayload(USER, { forward: 'support@corp.com' });
    expect(cfg.emailAction).toBe('forward_manager');
    expect(cfg.emailForwardAddress).toBe('support@corp.com');
    // Lone --forward: the delegate falls back to the forward address.
    expect(cfg.delegateEmail).toBe('support@corp.com');
  });

  it('--forward and --delegate can target DIFFERENT addresses independently', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      forward: 'support@corp.com',
      delegate: 'deputy@corp.com',
    });
    expect(cfg.emailForwardAddress).toBe('support@corp.com');
    expect(cfg.delegateEmail).toBe('deputy@corp.com');
    expect(cfg.emailAction).toBe('forward_manager');
  });

  it('a lone --delegate still forwards to the delegate (handover pair is gated together)', () => {
    const cfg = buildOffboardConfigPayload(USER, { delegate: 'deputy@corp.com' });
    expect(cfg.emailForwardAddress).toBe('deputy@corp.com');
    expect(cfg.delegateEmail).toBe('deputy@corp.com');
  });

  it('mail handover falls back to the manager when no explicit forward/delegate email is given', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      manager: 'boss@corp.com',
      forward: '',
    });
    expect(cfg.emailForwardAddress).toBe('boss@corp.com');
    expect(cfg.delegateEmail).toBe('boss@corp.com');
  });

  it('--vacation="msg" sets an auto-reply with the given message', () => {
    const cfg = buildOffboardConfigPayload(USER, { vacation: 'I have left the company.' });
    expect(cfg.emailAction).toBe('auto_reply');
    expect(cfg.emailAutoReplyMessage).toBe('I have left the company.');
  });

  it('--vacation with no message uses the default vacation body', () => {
    const cfg = buildOffboardConfigPayload(USER, { vacation: '' });
    expect(cfg.emailAction).toBe('auto_reply');
    expect(cfg.emailAutoReplyMessage).toBe(DEFAULT_VACATION_MESSAGE);
  });

  it('forwarding takes precedence over a vacation responder when both are requested', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      forward: 'support@corp.com',
      vacation: 'Gone',
    });
    expect(cfg.emailAction).toBe('forward_manager');
    expect(cfg.emailAutoReplyMessage).toBeUndefined();
  });

  it('--move-ou moves the user into the given org unit', () => {
    const cfg = buildOffboardConfigPayload(USER, { 'move-ou': '/Offboarded' });
    expect(cfg.orgUnitPath).toBe('/Offboarded');
  });

  it('--add-group adds the user to the given offboarded group', () => {
    const cfg = buildOffboardConfigPayload(USER, { 'add-group': 'offboarded@corp.com' });
    expect(cfg.offboardedGroupEmail).toBe('offboarded@corp.com');
  });

  it('--revoke revokes OAuth tokens and signs the user out of all devices', () => {
    const cfg = buildOffboardConfigPayload(USER, { revoke: '' });
    expect(cfg.revokeOauthTokens).toBe(true);
    expect(cfg.signOutAllDevices).toBe(true);
  });

  it('composes a full offboard from many flags into one orchestrator payload', () => {
    const cfg = buildOffboardConfigPayload(USER, {
      manager: 'boss@corp.com',
      'transfer-drive': '',
      'transfer-calendar': '',
      forward: 'support@corp.com',
      delegate: 'deputy@corp.com',
      'move-ou': '/Offboarded',
      'add-group': 'offboarded@corp.com',
      revoke: '',
      delete: '',
    });
    expect(cfg).toEqual({
      userEmail: USER,
      managerEmail: 'boss@corp.com',
      driveAction: 'transfer_manager',
      calendarTransferMeetingOwnership: true,
      emailAction: 'forward_manager',
      emailForwardAddress: 'support@corp.com',
      delegateEmail: 'deputy@corp.com',
      offboardedGroupEmail: 'offboarded@corp.com',
      orgUnitPath: '/Offboarded',
      revokeOauthTokens: true,
      signOutAllDevices: true,
      accountAction: 'suspend_immediately',
      deleteAccount: true,
      deleteImmediately: true,
    });
  });
});
