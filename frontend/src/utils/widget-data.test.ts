import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY, getEnabledWidgets } from '../config/widgets';
import { getWidgetData, type OrganizationStats } from './widget-data';

const stats = (microsoftConnected: boolean): OrganizationStats => ({
  google: {
    connected: true, totalUsers: 6, suspendedUsers: 2, adminUsers: 1, lastSync: new Date().toISOString(),
    licenses: { used: 4, total: 10 }, recentlyDeleted: 5, inactive30d: 3,
  },
  microsoft: { connected: microsoftConnected, totalUsers: 2, disabledUsers: 0, adminUsers: 1, lastSync: null, licenses: null },
  helios: { totalUsers: 2, guestUsers: 0 },
  security: {
    twoFactor: { total: 6, enrolled: 4, notEnrolled: 2, percentage: 67 },
    oauthApps: { totalApps: 1, totalGrants: 1, topApps: [] },
  },
  sync: { errors: [] },
  lifecycle: { scheduledActions: 1, pendingOffboarding: 0 },
});

describe('dashboard cards', () => {
  it('draws every card that can be chosen (none shows nothing)', () => {
    // Five cards used to be listed in Customize Dashboard with no drawing code.
    const blank = WIDGET_REGISTRY.filter((w) => getWidgetData(w.id, stats(true)) === null).map((w) => w.id);
    expect(blank).toEqual([]);
  });

  it('turns on the cards that need action by default', () => {
    const on = getEnabledWidgets().map((w) => w.id);
    for (const id of [
      'google-recently-deleted', 'google-inactive-users', 'system-sync-errors',
      'system-pending-offboarding', 'system-scheduled-actions', 'security-2fa-adoption',
    ]) {
      expect(on).toContain(id);
    }
    for (const id of ['google-last-sync', 'system-sync-status', 'helios-total-users', 'helios-guests']) {
      expect(on).not.toContain(id);
    }
  });

  it('shows Microsoft 365 cards only once Microsoft 365 is connected', () => {
    expect(getWidgetData('microsoft-total-users', stats(false))).toBeNull();
    expect(getWidgetData('microsoft-total-users', stats(true))).not.toBeNull();
  });

  it('leads the 2FA card with the number of people without 2FA', () => {
    expect(getWidgetData('security-2fa-adoption', stats(false))?.label).toBe('2 of 6 without 2FA');
  });

  it('says a count is unavailable instead of showing zero', () => {
    const s = stats(false);
    s.google!.inactive30d = null;
    s.sync = { errors: null };
    expect(getWidgetData('google-inactive-users', s)?.value).toBe('N/A');
    expect(getWidgetData('system-sync-errors', s)?.value).toBe('N/A');
  });

  it('names the platform and error when a sync failed', () => {
    const s = stats(false);
    s.sync = { errors: [{ platform: 'google', error: 'Not authorized', at: null }] };
    const card = getWidgetData('system-sync-errors', s);
    expect(card?.value).toBe(1);
    expect(card?.state).toBe('error');
    expect(card?.footer).toBe('Google Workspace: Not authorized');
  });
});
