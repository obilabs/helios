import React from 'react';
import { WIDGET_REGISTRY, type WidgetId } from '../config/widgets';
import type { MetricCardSize, MetricState } from '../components/MetricCard';

export interface WidgetData {
  id: WidgetId;
  icon: React.ReactNode;
  title: string;
  value: string | number;
  label: string;
  footer?: string;
  state?: MetricState;
  size?: MetricCardSize;
  platformColor?: string;
  gridColumn?: number;
  onClick?: () => void;
}

export interface OrganizationStats {
  google?: {
    connected: boolean;
    totalUsers: number;
    suspendedUsers: number;
    adminUsers: number;
    lastSync: string | null;
    licenses?: {
      used: number;
      total: number | null;
      reportDate?: string;
      skuName?: string | null;
      skus?: Array<{ name: string; used: number; total: number; available: number }>;
    } | null;
    /** null when the count could not be read. */
    recentlyDeleted?: number | null;
    inactive30d?: number | null;
  };
  sync?: {
    /** Platforms whose last sync failed; null when the status could not be read. */
    errors: Array<{ platform: 'google' | 'microsoft'; error: string | null; at: string | null }> | null;
  };
  lifecycle?: {
    scheduledActions: number | null;
    pendingOffboarding: number | null;
  };
  microsoft?: {
    connected: boolean;
    totalUsers: number;
    disabledUsers: number;
    adminUsers: number;
    lastSync: string | null;
    licenses?: {
      used: number;
      total: number | null;
      reportDate?: string;
      skuName?: string | null;
      skus?: Array<{ name: string; used: number; total: number; available: number }>;
    } | null;
  };
  helios?: {
    totalUsers: number;
    guestUsers: number;
  };
  security?: {
    twoFactor: {
      total: number;
      enrolled: number;
      notEnrolled: number;
      percentage: number;
      bySource?: {
        helios: { total: number; enrolled: number };
        google: { total: number; enrolled: number };
        m365: { total: number; enrolled: number };
      };
    };
    oauthApps: {
      totalApps: number;
      totalGrants: number;
      topApps: Array<{
        displayName: string;
        userCount: number;
      }>;
    };
  };
}

const formatLastSync = (syncTime: string | null): string => {
  if (!syncTime) return 'Never synced';
  const date = new Date(syncTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
  return date.toLocaleDateString();
};

/** A card whose count could not be read says so, instead of showing a reassuring zero. */
const unavailable = <T extends object>(base: T, what: string): T & Pick<WidgetData, 'value' | 'label' | 'footer' | 'state'> => ({
  ...base,
  value: 'N/A',
  label: `${what} unavailable`,
  footer: 'Could not be read; see the backend log',
  state: 'default',
});

export const getWidgetData = (
  widgetId: WidgetId,
  stats: OrganizationStats | null,
  onClick?: () => void
): WidgetData | null => {
  const widget = WIDGET_REGISTRY.find(w => w.id === widgetId);
  if (!widget) return null;

  const baseData = {
    id: widgetId,
    icon: widget.icon,
    title: widget.title,
    platformColor: widget.platformColor,
    gridColumn: widget.gridColumn,
    onClick,
  };

  // Google Workspace Widgets
  if (widgetId === 'google-total-users') {
    return {
      ...baseData,
      value: stats?.google?.totalUsers || 0,
      label: 'users',
      footer: formatLastSync(stats?.google?.lastSync || null),
      state: 'default',
    };
  }

  if (widgetId === 'google-suspended') {
    const suspended = stats?.google?.suspendedUsers || 0;
    return {
      ...baseData,
      value: suspended,
      label: 'suspended',
      footer: suspended > 0 ? 'Review and restore or remove' : 'All users active',
      state: suspended > 0 ? 'warning' : 'success',
    };
  }

  if (widgetId === 'google-admins') {
    return {
      ...baseData,
      value: stats?.google?.adminUsers || 0,
      label: 'admins',
      state: 'default',
    };
  }

  if (widgetId === 'google-licenses') {
    const licenses = stats?.google?.licenses;
    if (!licenses || !licenses.total) {
      return {
        ...baseData,
        value: 'N/A',
        label: 'license data unavailable',
        state: 'default',
      };
    }

    const percentUsed = Math.round((licenses.used / licenses.total) * 100);
    return {
      ...baseData,
      value: `${percentUsed}%`,
      label: licenses.skuName ? `${licenses.used} / ${licenses.total} · ${licenses.skuName}` : `${licenses.used} / ${licenses.total} licenses`,
      footer: licenses.reportDate ? `As of ${new Date(licenses.reportDate).toLocaleDateString()}` : undefined,
      state: percentUsed > 100 ? 'error' : percentUsed >= 90 ? 'warning' : 'default',
    };
  }

  if (widgetId === 'google-last-sync') {
    const lastSync = stats?.google?.lastSync;
    const needsSync = !lastSync;
    return {
      ...baseData,
      value: formatLastSync(lastSync || null),
      label: 'last sync',
      state: needsSync ? 'warning' : 'default',
    };
  }

  if (widgetId === 'google-recently-deleted') {
    const n = stats?.google?.recentlyDeleted;
    if (n == null) return unavailable(baseData, 'deleted users');
    return {
      ...baseData,
      value: n,
      label: 'deleted in the last 20 days',
      footer: n > 0 ? 'Google can restore them for 20 days' : 'None to restore',
      state: n > 0 ? 'warning' : 'success',
    };
  }

  if (widgetId === 'google-inactive-users') {
    const n = stats?.google?.inactive30d;
    if (n == null) return unavailable(baseData, 'inactive users');
    return {
      ...baseData,
      value: n,
      label: 'no sign-in for 30 days',
      footer: n > 0 ? 'Active accounts that may still hold licences' : 'Everyone signed in recently',
      state: n > 0 ? 'warning' : 'success',
    };
  }

  // Microsoft 365 cards are on by default and appear once Microsoft 365 is connected.
  if (widgetId.startsWith('microsoft-') && !stats?.microsoft?.connected) {
    return null;
  }

  // Microsoft 365 Widgets
  if (widgetId === 'microsoft-total-users') {
    return {
      ...baseData,
      value: stats?.microsoft?.totalUsers || 0,
      label: 'users',
      footer: formatLastSync(stats?.microsoft?.lastSync || null),
      state: 'default',
    };
  }

  if (widgetId === 'microsoft-disabled') {
    const disabled = stats?.microsoft?.disabledUsers || 0;
    return {
      ...baseData,
      value: disabled,
      label: 'disabled',
      footer: disabled > 0 ? 'Review and restore or remove' : 'All users enabled',
      state: disabled > 0 ? 'warning' : 'success',
    };
  }

  if (widgetId === 'microsoft-admins') {
    return {
      ...baseData,
      value: stats?.microsoft?.adminUsers || 0,
      label: 'admins',
      state: 'default',
    };
  }

  if (widgetId === 'microsoft-licenses') {
    const licenses = stats?.microsoft?.licenses;
    if (!licenses || !licenses.total) {
      return {
        ...baseData,
        value: 'N/A',
        label: 'license data unavailable',
        state: 'default',
      };
    }

    const percentUsed = Math.round((licenses.used / licenses.total) * 100);
    return {
      ...baseData,
      value: `${percentUsed}%`,
      label: licenses.skuName ? `${licenses.used} / ${licenses.total} · ${licenses.skuName}` : `${licenses.used} / ${licenses.total} licenses`,
      footer: licenses.reportDate ? `As of ${new Date(licenses.reportDate).toLocaleDateString()}` : undefined,
      state: percentUsed > 100 ? 'error' : percentUsed >= 90 ? 'warning' : 'default',
    };
  }

  // Helios Portal Widgets
  if (widgetId === 'helios-total-users') {
    return {
      ...baseData,
      value: stats?.helios?.totalUsers || 0,
      label: 'local users',
      state: 'default',
    };
  }

  if (widgetId === 'helios-guests') {
    return {
      ...baseData,
      value: stats?.helios?.guestUsers || 0,
      label: 'guest users',
      state: 'default',
    };
  }


  // System Widgets
  if (widgetId === 'system-alerts') {
    // Calculate total alerts
    const googleSuspended = stats?.google?.suspendedUsers || 0;
    const microsoftDisabled = stats?.microsoft?.disabledUsers || 0;
    const googleNeedsSync = stats?.google?.connected && !stats?.google?.lastSync ? 1 : 0;
    const microsoftNeedsSync = stats?.microsoft?.connected && !stats?.microsoft?.lastSync ? 1 : 0;

    const totalAlerts = googleSuspended + microsoftDisabled + googleNeedsSync + microsoftNeedsSync;

    return {
      ...baseData,
      value: totalAlerts,
      label: totalAlerts === 1 ? 'alert' : 'alerts',
      footer: totalAlerts > 0 ? 'Requires attention' : 'All systems normal',
      state: totalAlerts > 0 ? 'warning' : 'success',
    };
  }

  if (widgetId === 'system-sync-status') {
    const googleSynced = stats?.google?.connected && stats?.google?.lastSync;
    const microsoftSynced = stats?.microsoft?.connected && stats?.microsoft?.lastSync;
    const allSynced = (!stats?.google?.connected || googleSynced) && (!stats?.microsoft?.connected || microsoftSynced);

    return {
      ...baseData,
      value: allSynced ? 'Synced' : 'Needs Sync',
      label: 'all platforms',
      state: allSynced ? 'success' : 'warning',
    };
  }

  if (widgetId === 'system-sync-errors') {
    const errors = stats?.sync?.errors;
    if (errors == null) return unavailable(baseData, 'sync status');
    const names = errors.map(e => (e.platform === 'google' ? 'Google Workspace' : 'Microsoft 365'));
    return {
      ...baseData,
      value: errors.length,
      label: errors.length === 1 ? 'failed sync' : 'failed syncs',
      footer: errors.length > 0
        ? `${names.join(' and ')}: ${errors[0].error || 'last sync failed'}`.slice(0, 120)
        : 'Last syncs succeeded',
      state: errors.length > 0 ? 'error' : 'success',
    };
  }

  if (widgetId === 'system-pending-offboarding') {
    const n = stats?.lifecycle?.pendingOffboarding;
    if (n == null) return unavailable(baseData, 'offboarding');
    return {
      ...baseData,
      value: n,
      label: n === 1 ? 'offboarding scheduled' : 'offboardings scheduled',
      footer: n > 0 ? 'Scheduled and not yet finished' : 'Nothing in progress',
      state: 'default',
    };
  }

  if (widgetId === 'system-scheduled-actions') {
    const n = stats?.lifecycle?.scheduledActions;
    if (n == null) return unavailable(baseData, 'scheduled actions');
    return {
      ...baseData,
      value: n,
      label: n === 1 ? 'action waiting' : 'actions waiting',
      footer: n > 0 ? 'Onboarding, offboarding and other scheduled changes' : 'Nothing scheduled',
      state: 'default',
    };
  }

  // Security Widgets
  if (widgetId === 'security-2fa-adoption') {
    const twoFactor = stats?.security?.twoFactor;
    if (!twoFactor) {
      return {
        ...baseData,
        value: 'N/A',
        label: 'sync required',
        footer: 'Enable integrations to see 2FA status',
        state: 'default',
      };
    }

    // Build footer with per-source breakdown if available
    let footer = twoFactor.percentage >= 90 ? 'Excellent adoption' : twoFactor.percentage >= 70 ? 'Good progress' : 'Needs improvement';

    if (twoFactor.bySource) {
      const parts: string[] = [];
      if (twoFactor.bySource.helios.total > 0) {
        parts.push(`H: ${twoFactor.bySource.helios.enrolled}/${twoFactor.bySource.helios.total}`);
      }
      if (twoFactor.bySource.google.total > 0) {
        parts.push(`G: ${twoFactor.bySource.google.enrolled}/${twoFactor.bySource.google.total}`);
      }
      if (twoFactor.bySource.m365.total > 0) {
        parts.push(`M: ${twoFactor.bySource.m365.enrolled}/${twoFactor.bySource.m365.total}`);
      }
      if (parts.length > 0) {
        footer = parts.join(' | ');
      }
    }

    // The number of people without 2FA is the actionable part, so it leads the label.
    return {
      ...baseData,
      value: `${twoFactor.percentage}%`,
      label: twoFactor.notEnrolled > 0
        ? `${twoFactor.notEnrolled} of ${twoFactor.total} without 2FA`
        : `all ${twoFactor.total} users enrolled`,
      footer,
      state: twoFactor.notEnrolled > 0 ? 'warning' : 'success',
    };
  }

  if (widgetId === 'security-connected-apps') {
    const oauthApps = stats?.security?.oauthApps;
    if (!oauthApps) {
      return {
        ...baseData,
        value: 'N/A',
        label: 'sync required',
        footer: 'Run OAuth sync',
        state: 'default',
      };
    }

    return {
      ...baseData,
      value: oauthApps.totalApps,
      label: 'apps',
      footer: `${oauthApps.totalGrants} total grants`,
      state: 'default',
    };
  }

  if (widgetId === 'security-users-without-2fa') {
    const twoFactor = stats?.security?.twoFactor;
    if (!twoFactor) {
      return {
        ...baseData,
        value: 'N/A',
        label: 'sync required',
        state: 'default',
      };
    }

    return {
      ...baseData,
      value: twoFactor.notEnrolled,
      label: 'users without 2FA',
      footer: twoFactor.notEnrolled > 0 ? 'Requires attention' : 'All users protected',
      state: twoFactor.notEnrolled > 0 ? 'warning' : 'success',
    };
  }

  return null;
};
