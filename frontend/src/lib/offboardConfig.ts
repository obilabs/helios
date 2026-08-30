/**
 * Offboarding console -> orchestrator payload builder (pure, side-effect free).
 *
 * The `gw offboard <user>` console command (alias `gw users offboard`) no longer
 * runs its own unaudited/unguarded Google sequence. Instead it translates its
 * flags into an OffboardingConfig with THIS function and POSTs `{ config }` to
 * the AUDITED + GUARDED orchestrator endpoint (POST /api/v1/lifecycle/offboard).
 * The orchestrator suspends by default, keeps deletion opt-in + guarded (admin
 * self-lockout protection), merges org-policy defaults, and records every step
 * in the lifecycle audit log.
 *
 * This module is the single source of truth for the flags -> config mapping and
 * is unit-tested in offboardConfig.test.ts (no network, pure descriptors).
 */

// Local mirrors of the backend union types (kept local so the frontend doesn't
// import backend server types). Must stay in sync with
// backend/src/types/user-lifecycle.ts.
export type DriveAction = 'transfer_manager' | 'transfer_user' | 'archive' | 'keep' | 'delete';
export type EmailAction = 'forward_manager' | 'forward_user' | 'auto_reply' | 'archive' | 'keep';
export type AccountAction = 'suspend_immediately' | 'suspend_on_last_day' | 'keep_active';

export interface OffboardOrchestratorConfig {
  userEmail: string;
  managerEmail?: string;

  // Drive / calendar data transfer
  driveAction: DriveAction;
  calendarTransferMeetingOwnership?: boolean;
  cancelFutureEvents?: boolean;

  // Mail handover
  emailAction: EmailAction;
  emailForwardAddress?: string;
  delegateEmail?: string;
  emailAutoReplyMessage?: string;

  // Access / membership
  revokeOauthTokens?: boolean;
  signOutAllDevices?: boolean;
  offboardedGroupEmail?: string;
  orgUnitPath?: string;

  // Account — suspend by default, delete opt-in + guarded
  accountAction: AccountAction;
  deleteAccount: boolean;
  deleteImmediately?: boolean;
}

/** Fallback Gmail auto-reply body when `--vacation` is given without a message. */
export const DEFAULT_VACATION_MESSAGE =
  'I am no longer with the organization and this mailbox is no longer monitored. ' +
  'Please contact my manager or team for assistance.';

/**
 * Build the orchestrator OffboardingConfig from a parsed flag map.
 *
 * Flags (see the console help): --manager=, --suspend (default) / --delete
 * (opt-in), --vacation[=msg], --transfer-drive, --transfer-calendar /
 * --cancel-events, --move-ou=/Path, --add-group=, --forward=, --delegate=,
 * --revoke.
 *
 * `params` comes from the console's parseArgs: a value-less flag like
 * `--suspend` maps to the empty string, so PRESENCE is tested with `has()` and
 * a non-empty VALUE with `val()`.
 */
export function buildOffboardConfigPayload(
  email: string,
  params: Record<string, string>
): OffboardOrchestratorConfig {
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(params, k);
  const val = (k: string): string | undefined => {
    const v = params[k];
    return v !== undefined && v.length > 0 ? v : undefined;
  };

  const manager = val('manager');
  const forward = val('forward');
  const delegate = val('delegate');

  // Destructive delete is opt-in + guarded; suspend is the default. When --delete
  // is requested we still suspend first (safest ordering — the orchestrator
  // suspends before it deletes, so a failed delete leaves a suspended account).
  const wantsDelete = has('delete');

  // Drive / calendar transfer target is the manager (folded into one Data
  // Transfer by the orchestrator when calendar transfer is also requested).
  const wantsDriveTransfer = has('transfer-drive');
  const wantsCalendarTransfer = has('transfer-calendar');
  const driveAction: DriveAction =
    wantsDriveTransfer || wantsCalendarTransfer ? 'transfer_manager' : 'keep';

  // Mail handover: forwarding + Gmail delegation are gated together by the
  // orchestrator, so a lone --forward or --delegate activates the pair. Each
  // address falls back to the other, then to the manager.
  const wantsMailHandover = has('forward') || has('delegate');
  const wantsVacation = has('vacation');

  let emailAction: EmailAction = 'keep';
  let emailForwardAddress: string | undefined;
  let delegateEmail: string | undefined;
  let emailAutoReplyMessage: string | undefined;

  if (wantsMailHandover) {
    // Forwarding/delegation take precedence over a vacation responder: the
    // orchestrator's emailAction is single-valued and cannot do both at once.
    emailAction = 'forward_manager';
    emailForwardAddress = forward ?? delegate ?? manager;
    delegateEmail = delegate ?? forward ?? manager;
  } else if (wantsVacation) {
    emailAction = 'auto_reply';
    emailAutoReplyMessage = val('vacation') ?? DEFAULT_VACATION_MESSAGE;
  }

  const config: OffboardOrchestratorConfig = {
    userEmail: email,
    driveAction,
    emailAction,
    accountAction: 'suspend_immediately',
    deleteAccount: wantsDelete,
  };

  if (manager) config.managerEmail = manager;
  if (emailForwardAddress) config.emailForwardAddress = emailForwardAddress;
  if (delegateEmail) config.delegateEmail = delegateEmail;
  if (emailAutoReplyMessage) config.emailAutoReplyMessage = emailAutoReplyMessage;
  if (wantsCalendarTransfer) config.calendarTransferMeetingOwnership = true;
  if (has('cancel-events')) config.cancelFutureEvents = true;
  if (val('add-group')) config.offboardedGroupEmail = val('add-group');
  if (val('move-ou')) config.orgUnitPath = val('move-ou');
  if (has('revoke')) {
    config.revokeOauthTokens = true;
    config.signOutAllDevices = true;
  }
  if (wantsDelete) config.deleteImmediately = true;

  return config;
}
