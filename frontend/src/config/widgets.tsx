import React from 'react';
import { Users, UserX, Shield, Package, RefreshCw, AlertCircle, Activity, UserPlus, Trash2, Clock, UserMinus, Key, Calendar, ShieldCheck, AppWindow, AlertTriangle } from 'lucide-react';

export type WidgetId = string;
export type WidgetCategory = 'google' | 'microsoft' | 'helios' | 'system' | 'security';

export interface WidgetDefinition {
  id: WidgetId;
  category: WidgetCategory;
  title: string;
  icon: React.ReactNode;
  gridColumn: number; // Spans in 12-column grid
  enabled: boolean; // Default visibility
  platformColor?: string;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Google Workspace Widgets
  {
    id: 'google-total-users',
    category: 'google',
    title: 'Google Workspace',
    icon: <img src="https://www.gstatic.com/images/branding/product/1x/admin_32dp.png" alt="Google" style={{ width: 16, height: 16 }} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#4285f4',
  },
  {
    id: 'google-suspended',
    category: 'google',
    title: 'Suspended',
    icon: <UserX size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#4285f4',
  },
  {
    id: 'google-admins',
    category: 'google',
    title: 'Admins',
    icon: <Shield size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#4285f4',
  },
  {
    id: 'google-licenses',
    category: 'google',
    title: 'License Usage',
    icon: <Package size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#4285f4',
  },
  {
    id: 'google-last-sync',
    category: 'google',
    title: 'Last Sync',
    icon: <RefreshCw size={16} />,
    gridColumn: 3,
    enabled: false, // Hidden by default
    platformColor: '#4285f4',
  },
  {
    id: 'google-recently-deleted',
    category: 'google',
    title: 'Recently Deleted',
    icon: <Trash2 size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#4285f4',
  },
  {
    id: 'google-inactive-users',
    category: 'google',
    title: 'Inactive (30d)',
    icon: <Clock size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#4285f4',
  },

  // Microsoft 365 Widgets
  {
    id: 'microsoft-total-users',
    category: 'microsoft',
    title: 'Microsoft 365',
    icon: <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" style={{ width: 16, height: 16 }} />,
    gridColumn: 3,
    enabled: false, // Only show when Microsoft is connected
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-disabled',
    category: 'microsoft',
    title: 'Disabled',
    icon: <UserX size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-admins',
    category: 'microsoft',
    title: 'Admins',
    icon: <Shield size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-licenses',
    category: 'microsoft',
    title: 'License Usage',
    icon: <Package size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-recently-deleted',
    category: 'microsoft',
    title: 'Recently Deleted',
    icon: <Trash2 size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-inactive-users',
    category: 'microsoft',
    title: 'Inactive (30d)',
    icon: <Clock size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },
  {
    id: 'microsoft-password-expiring',
    category: 'microsoft',
    title: 'Password Expiring',
    icon: <Key size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#00a4ef',
  },

  // Helios Portal Widgets
  {
    id: 'helios-total-users',
    category: 'helios',
    title: 'Local Users',
    icon: <Users size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: 'var(--theme-primary)',
  },
  {
    id: 'helios-guests',
    category: 'helios',
    title: 'Guest Users',
    icon: <UserPlus size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: 'var(--theme-primary)',
  },
  {
    id: 'helios-recent-signups',
    category: 'helios',
    title: 'Recent Signups',
    icon: <Activity size={16} />,
    gridColumn: 3,
    enabled: false, // Hidden by default
    platformColor: 'var(--theme-primary)',
  },

  // System Widgets
  {
    id: 'system-alerts',
    category: 'system',
    title: 'Alerts',
    icon: <AlertCircle size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#f59e0b',
  },
  {
    id: 'system-sync-status',
    category: 'system',
    title: 'Sync Status',
    icon: <RefreshCw size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#6b7280',
  },
  {
    id: 'system-pending-offboarding',
    category: 'system',
    title: 'Pending Offboarding',
    icon: <UserMinus size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#ef4444',
  },
  {
    id: 'system-scheduled-actions',
    category: 'system',
    title: 'Scheduled Actions',
    icon: <Calendar size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#8b5cf6',
  },
  {
    id: 'system-sync-errors',
    category: 'system',
    title: 'Sync Errors',
    icon: <AlertCircle size={16} />,
    gridColumn: 3,
    enabled: false,
    platformColor: '#ef4444',
  },

  // Security Widgets
  {
    id: 'security-2fa-adoption',
    category: 'security',
    title: '2FA Adoption',
    icon: <ShieldCheck size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#10b981', // green
  },
  {
    id: 'security-connected-apps',
    category: 'security',
    title: 'Connected Apps',
    icon: <AppWindow size={16} />,
    gridColumn: 3,
    enabled: true,
    platformColor: '#8b5cf6', // purple
  },
  {
    id: 'security-users-without-2fa',
    category: 'security',
    title: 'Users Without 2FA',
    icon: <AlertTriangle size={16} />,
    gridColumn: 3,
    enabled: false, // Hidden by default
    platformColor: '#ef4444', // red
  },

  // TODO: Future system stats widgets
  // {
  //   id: 'system-cpu',
  //   category: 'system',
  //   title: 'CPU Usage',
  //   icon: <Activity size={16} />,
  //   gridColumn: 3,
  //   enabled: false,
  //   platformColor: '#10b981',
  // },
  // {
  //   id: 'system-memory',
  //   category: 'system',
  //   title: 'Memory Usage',
  //   icon: <Database size={16} />,
  //   gridColumn: 3,
  //   enabled: false,
  //   platformColor: '#10b981',
  // },
  // {
  //   id: 'system-disk',
  //   category: 'system',
  //   title: 'Disk Usage',
  //   icon: <HardDrive size={16} />,
  //   gridColumn: 3,
  //   enabled: false,
  //   platformColor: '#10b981',
  // },
  // {
  //   id: 'system-uptime',
  //   category: 'system',
  //   title: 'Uptime',
  //   icon: <Clock size={16} />,
  //   gridColumn: 3,
  //   enabled: false,
  //   platformColor: '#10b981',
  // },
];

export const getWidgetsByCategory = (category: WidgetCategory): WidgetDefinition[] => {
  return WIDGET_REGISTRY.filter(w => w.category === category);
};

export const getEnabledWidgets = (userPreferences?: WidgetId[]): WidgetDefinition[] => {
  if (userPreferences) {
    return WIDGET_REGISTRY.filter(w => userPreferences.includes(w.id));
  }
  return WIDGET_REGISTRY.filter(w => w.enabled);
};
