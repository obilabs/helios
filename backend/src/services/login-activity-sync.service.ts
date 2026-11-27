/**
 * Login activity pull: the one place that fetches Google login events into
 * login_activity.
 *
 * Called by the manual sync route (POST /login-activity/sync), by the sync
 * scheduler on each scheduled tick (at most once an hour), at backend start, and
 * right after Google is connected. The Home dashboard only reads what is stored;
 * it never asks Google itself.
 *
 * Window: from the newest stored login event minus an overlap (Google's login
 * reports arrive late) up to now. When nothing is stored, the last 7 days. Never
 * more than 7 days in one pull. Events already stored are skipped by
 * googleWorkspaceService.storeLoginEvents (same user, timestamp and IP).
 */
import { db } from '../database/connection.js';
import { googleWorkspaceService } from './google-workspace.service.js';
import { geoipService } from './geoip.service.js';
import { logger } from '../utils/logger.js';

const HOUR_MS = 60 * 60 * 1000;

/** Google's login reports can arrive hours after the sign-in; re-read this much. */
export const LOGIN_PULL_OVERLAP_MS = 2 * HOUR_MS;
/** The longest window one pull asks for, and the first pull's window. */
export const LOGIN_PULL_MAX_WINDOW_MS = 7 * 24 * HOUR_MS;
/** Automatic pulls run at most this often, however short the directory sync interval. */
export const LOGIN_PULL_MIN_INTERVAL_MS = HOUR_MS;

export interface LoginPullResult {
  success: boolean;
  fetched: number;
  stored: number;
  geoEnriched: number;
  errors: number;
  error?: string;
  window: { startTime: Date; endTime: Date };
}

/**
 * The window one pull covers. `newestStored` is the newest login event already
 * stored for the organization, or null when there is none.
 */
export function computeLoginPullWindow(newestStored: Date | null, now: Date): { startTime: Date; endTime: Date } {
  const endTime = now;
  const earliest = new Date(now.getTime() - LOGIN_PULL_MAX_WINDOW_MS);
  if (!newestStored || Number.isNaN(newestStored.getTime())) {
    return { startTime: earliest, endTime };
  }
  let start = new Date(newestStored.getTime() - LOGIN_PULL_OVERLAP_MS);
  if (start < earliest) start = earliest;
  // A stored event dated in the future (clock skew) must not produce an empty or inverted window.
  if (start >= endTime) start = new Date(endTime.getTime() - LOGIN_PULL_OVERLAP_MS);
  return { startTime: start, endTime };
}

/** A tenant that has not authorised the Reports scope refuses the token exchange with this. */
function isScopeNotAuthorized(message: string | undefined): boolean {
  return !!message && message.includes('unauthorized_client');
}

/** Google is simply not set up for this organization: nothing to pull, nothing to warn about. */
function isNotConnected(message: string | undefined): boolean {
  return message === 'No credentials found' || message === 'No admin email configured';
}

export class LoginActivitySyncService {
  /** When an automatic or manual pull last started, per organization (this backend process). */
  private lastPullAt: Map<string, number> = new Map();
  /** A pull in progress, per organization, so overlapping callers share it instead of racing. */
  private inFlight: Map<string, Promise<LoginPullResult>> = new Map();
  /** Organizations already warned about the missing Reports scope since this backend started. */
  private scopeWarned: Set<string> = new Set();

  /**
   * Pull login events now. Used by the manual refresh; the scheduler and the
   * connect step go through pullIfDue. Never throws.
   */
  async pull(organizationId: string, now: Date = new Date()): Promise<LoginPullResult> {
    const running = this.inFlight.get(organizationId);
    if (running) return running;
    const p = this.runPull(organizationId, now).finally(() => this.inFlight.delete(organizationId));
    this.inFlight.set(organizationId, p);
    return p;
  }

  /**
   * Pull login events unless a pull started less than an hour ago. Never throws;
   * returns null when skipped.
   */
  async pullIfDue(organizationId: string, now: Date = new Date()): Promise<LoginPullResult | null> {
    const last = this.lastPullAt.get(organizationId);
    if (last !== undefined && now.getTime() - last < LOGIN_PULL_MIN_INTERVAL_MS) {
      logger.debug('Login activity pull skipped: one ran less than an hour ago', { organizationId });
      return null;
    }
    return this.pull(organizationId, now);
  }

  private async runPull(organizationId: string, now: Date): Promise<LoginPullResult> {
    this.lastPullAt.set(organizationId, now.getTime());
    let window = computeLoginPullWindow(null, now);
    try {
      const newest = await db.query(
        `SELECT MAX(login_timestamp) AS newest FROM login_activity
          WHERE organization_id = $1 AND source = 'google'`,
        [organizationId],
      );
      const raw = newest.rows[0]?.newest;
      window = computeLoginPullWindow(raw ? new Date(raw) : null, now);

      const syncResult = await googleWorkspaceService.syncLoginActivity(organizationId, window);
      if (!syncResult.success) {
        this.reportFailure(organizationId, syncResult.error);
        return { ...syncResult, geoEnriched: 0, window };
      }

      let geoEnriched = 0;
      let errors = syncResult.errors;
      if (syncResult.stored > 0) {
        const geo = await geoipService.enrichLoginActivity(organizationId, syncResult.stored);
        geoEnriched = geo.updated;
        errors += geo.errors;
      }
      return { success: true, fetched: syncResult.fetched, stored: syncResult.stored, geoEnriched, errors, window };
    } catch (error: any) {
      const message = String(error?.message || error);
      this.reportFailure(organizationId, message);
      return { success: false, fetched: 0, stored: 0, geoEnriched: 0, errors: 1, error: message, window };
    }
  }

  private reportFailure(organizationId: string, reason: string | undefined): void {
    if (isNotConnected(reason)) {
      logger.debug('Login activity pull skipped: Google Workspace is not connected', { organizationId });
      return;
    }
    if (isScopeNotAuthorized(reason)) {
      if (this.scopeWarned.has(organizationId)) {
        logger.debug('Login activity pull skipped: Reports scope not authorised', { organizationId });
        return;
      }
      this.scopeWarned.add(organizationId);
      logger.warn(
        'Login activity pull failed: the admin.reports.audit.readonly scope is not authorised for the service account. ' +
          'The Login Locations block stays empty until it is added in Google Admin Console > Security > API Controls > ' +
          'Domain-wide delegation. This is logged once per backend start.',
        { organizationId, reason },
      );
      return;
    }
    logger.warn('Login activity pull failed', { organizationId, reason: reason || 'unknown' });
  }
}

export const loginActivitySync = new LoginActivitySyncService();
