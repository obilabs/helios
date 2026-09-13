/**
 * Pages and navigation — the single source for where every page lives, which
 * feature flag gates it, and where it appears in the sidebar.
 *
 * Navigation, the URL -> page mapping, the "Page Not Found" check and the
 * "not enabled" gate all read these tables. Turning a flag off therefore
 * removes the page everywhere at once: sidebar, dashboard shortcuts, search
 * and direct URLs.
 *
 * Flags are defined (with their maturity) in
 * backend/src/config/feature-registry.ts; navigation.test.ts fails the build if
 * a page references a flag that is not registered there, or if two nav entries
 * point at the same page.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Users as UsersIcon,
  UsersRound,
  UserCheck,
  User,
  Package,
  PenTool,
  AlertCircle,
  Settings as SettingsIcon,
  Network,
  MessageSquare,
  ClipboardList,
  FileText,
  Image,
  UserPlus,
  UserMinus,
  Clock,
  Share2,
  Search,
  CheckSquare,
  GraduationCap,
  LayoutDashboard,
  BarChart3,
  Zap,
  AppWindow,
  Key,
  Building2,
  Layers,
  ArrowRightLeft,
  MailPlus,
} from 'lucide-react';
import { ENTITIES, type EntityName } from './entities';

export interface PageDef {
  /** Human title, used by the "not enabled" page. */
  title: string;
  /** Registered feature flag that gates this page. `core.*` flags are always on. */
  flag: string;
  /** Route in the admin console. */
  adminPath?: string;
  /** Route in the employee view. */
  userPath?: string;
  /** Legacy/alternate URLs that resolve to this page (exact match or prefix). */
  aliases?: string[];
}

export const PAGES = {
  // Core
  'dashboard': { title: 'Home', flag: 'core.dashboard', adminPath: '/admin', userPath: '/', aliases: ['/admin/dashboard', '/home', '/dashboard', '/user/dashboard'] },
  'users': { title: 'Users', flag: 'core.users', adminPath: '/admin/users', aliases: ['/users'] },
  'add-user': { title: 'Add user', flag: 'core.users', adminPath: '/add-user' },
  'settings': { title: 'Settings', flag: 'core.settings', adminPath: '/admin/settings', aliases: ['/settings', '/admin/administrators'] },
  'my-profile': { title: 'My Profile', flag: 'core.profile', userPath: '/my-profile' },

  // Directory
  'groups': { title: 'Groups', flag: 'directory.groups', adminPath: '/admin/groups', aliases: ['/groups'] },
  'orgUnits': { title: 'Org Units', flag: 'directory.org_units', adminPath: '/admin/org-units' },
  'orgChart': { title: 'Org Chart', flag: 'directory.org_chart', adminPath: '/admin/org-chart' },
  'workspaces': { title: 'Spaces', flag: 'directory.workspaces', adminPath: '/admin/workspaces' },
  'bulk-operations': { title: 'Bulk Operations', flag: 'directory.bulk_operations', adminPath: '/admin/bulk-operations' },
  'migration': { title: 'Migration', flag: 'directory.migration', adminPath: '/admin/migration' },
  'delegations': { title: 'Delegations', flag: 'directory.delegations', adminPath: '/admin/delegations' },
  'signatures': { title: 'Signatures', flag: 'signatures', adminPath: '/admin/signatures' },

  // Lifecycle
  'onboarding-templates': { title: 'Onboarding templates', flag: 'lifecycle.onboarding', adminPath: '/admin/onboarding-templates' },
  'new-onboarding-template': { title: 'Onboarding templates', flag: 'lifecycle.onboarding', adminPath: '/admin/onboarding-templates/new' },
  'edit-onboarding-template': { title: 'Onboarding templates', flag: 'lifecycle.onboarding', adminPath: '/admin/onboarding-templates/edit' },
  'new-user-onboarding': { title: 'Onboard a user', flag: 'lifecycle.onboarding', adminPath: '/admin/onboarding/new', aliases: ['/new-user-onboarding'] },
  'offboarding-templates': { title: 'Offboarding templates', flag: 'lifecycle.offboarding', adminPath: '/admin/offboarding-templates' },
  'new-offboarding-template': { title: 'Offboarding templates', flag: 'lifecycle.offboarding', adminPath: '/admin/offboarding-templates/new' },
  'edit-offboarding-template': { title: 'Offboarding templates', flag: 'lifecycle.offboarding', adminPath: '/admin/offboarding-templates/edit' },
  'user-offboarding': { title: 'Offboard a user', flag: 'lifecycle.offboarding', adminPath: '/admin/offboarding/user', aliases: ['/user-offboarding'] },
  'scheduled-actions': { title: 'Scheduled Actions', flag: 'automation.scheduled_actions', adminPath: '/admin/scheduled-actions' },
  'rules-engine': { title: 'Rules Engine', flag: 'automation.rules_engine', adminPath: '/admin/rules-engine' },
  'requests': { title: 'Requests', flag: 'lifecycle.requests', adminPath: '/admin/requests' },
  'tasks': { title: 'My Tasks', flag: 'lifecycle.tasks', adminPath: '/admin/tasks' },
  'training': { title: 'Training', flag: 'lifecycle.training', adminPath: '/admin/training' },

  // Security
  'security-events': { title: 'Security events', flag: 'security.events', adminPath: '/admin/security-events' },
  'oauth-apps': { title: 'OAuth apps', flag: 'security.oauth_apps', adminPath: '/admin/security/oauth-apps' },
  'external-sharing': { title: 'External sharing', flag: 'security.external_sharing', adminPath: '/admin/external-sharing' },
  'audit-logs': { title: 'Audit log', flag: 'security.audit_log', adminPath: '/admin/audit-logs' },
  'email-security': { title: 'Mail Search', flag: 'security.mail_search', adminPath: '/admin/email-security' },
  'licenses': { title: 'Licenses', flag: 'security.licenses', adminPath: '/admin/licenses' },

  // Insights & assets
  'hr-dashboard': { title: 'HR Dashboard', flag: 'insights.hr_dashboard', adminPath: '/admin/hr-dashboard' },
  'manager-dashboard': { title: 'Manager Dashboard', flag: 'insights.manager_dashboard', adminPath: '/admin/manager-dashboard' },
  'lifecycle-analytics': { title: 'Analytics', flag: 'insights.lifecycle_analytics', adminPath: '/admin/lifecycle-analytics' },
  'assets': { title: 'IT Assets', flag: 'assets.it_assets', adminPath: '/admin/assets' },
  'files-assets': { title: 'Media Files', flag: 'assets.media_files', adminPath: '/admin/files-assets', aliases: ['/admin/media-files'] },

  // Platform
  'console': { title: 'Developer Console', flag: 'developer.tools', adminPath: '/admin/console' },

  // Employee view
  'people': { title: 'People', flag: 'employee_view', userPath: '/people' },
  'my-team': { title: 'My Team', flag: 'employee_view', userPath: '/my-team' },
  'my-groups': { title: 'My Groups', flag: 'employee_view', userPath: '/my-groups' },
  'my-onboarding': { title: 'My Onboarding', flag: 'employee.onboarding_portal', userPath: '/my-onboarding' },
  'user-settings': { title: 'Personal settings', flag: 'employee.settings', userPath: '/user-settings' },
} satisfies Record<string, PageDef>;

export type PageId = keyof typeof PAGES;

/** Returned for a URL no page claims. */
export const NOT_FOUND_PAGE = 'not-found';

export function isKnownPage(page: string): page is PageId {
  return Object.prototype.hasOwnProperty.call(PAGES, page);
}

export function getPageDef(page: string): PageDef | undefined {
  return isKnownPage(page) ? PAGES[page] : undefined;
}

/** Roots only match exactly; everything else also claims its sub-paths. */
const EXACT_ONLY = new Set(['/', '/admin']);

const ROUTE_TABLE: Array<{ path: string; page: PageId }> = (Object.entries(PAGES) as Array<[PageId, PageDef]>)
  .flatMap(([page, def]) =>
    [def.adminPath, def.userPath, ...(def.aliases ?? [])]
      .filter((p): p is string => typeof p === 'string')
      .map((path) => ({ path, page })),
  );

/** Map a URL path to a page id: exact match first, then the longest prefix. */
export function getPageFromPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = ROUTE_TABLE.find((r) => r.path === path);
  if (exact) return exact.page;
  let best: { path: string; page: PageId } | undefined;
  for (const r of ROUTE_TABLE) {
    if (EXACT_ONLY.has(r.path)) continue;
    if (path.startsWith(`${r.path}/`) && (!best || r.path.length > best.path.length)) best = r;
  }
  return best ? best.page : NOT_FOUND_PAGE;
}

/** Where to send the browser for a page, preferring the current view's route. */
export function getPathForPage(page: string, view: 'admin' | 'user'): string | undefined {
  const def = getPageDef(page);
  if (!def) return undefined;
  return view === 'admin' ? def.adminPath ?? def.userPath : def.userPath ?? def.adminPath;
}

export interface NavItemDef {
  page: PageId;
  label: string;
  icon: LucideIcon;
  testId: string;
  /** Display label comes from the organization's custom entity labels. */
  labelEntity?: EntityName;
  /** Only shown when a connected module provides this entity. */
  requiresEntity?: EntityName;
}

export interface NavSectionDef {
  /** Null = an ungrouped top-level item. */
  title: string | null;
  items: NavItemDef[];
}

export const ADMIN_NAV: NavSectionDef[] = [
  { title: null, items: [
    { page: 'dashboard', label: 'Home', icon: Home, testId: 'nav-admin-dashboard' },
  ] },
  { title: 'Directory', items: [
    { page: 'users', label: 'Users', icon: UsersIcon, testId: 'nav-users', labelEntity: ENTITIES.USER },
    { page: 'groups', label: 'Groups', icon: UsersRound, testId: 'nav-access-groups', labelEntity: ENTITIES.ACCESS_GROUP, requiresEntity: ENTITIES.ACCESS_GROUP },
    { page: 'orgUnits', label: 'Org Units', icon: Building2, testId: 'nav-org-units', labelEntity: ENTITIES.POLICY_CONTAINER },
    { page: 'signatures', label: 'Signatures', icon: PenTool, testId: 'nav-signatures' },
    { page: 'orgChart', label: 'Org Chart', icon: Network, testId: 'nav-org-chart' },
    { page: 'workspaces', label: 'Spaces', icon: MessageSquare, testId: 'nav-workspaces', labelEntity: ENTITIES.WORKSPACE, requiresEntity: ENTITIES.WORKSPACE },
    { page: 'bulk-operations', label: 'Bulk Operations', icon: Layers, testId: 'nav-bulk-operations' },
    { page: 'migration', label: 'Migration', icon: ArrowRightLeft, testId: 'nav-migration' },
    { page: 'delegations', label: 'Delegations', icon: MailPlus, testId: 'nav-delegations' },
  ] },
  { title: 'Lifecycle', items: [
    { page: 'onboarding-templates', label: 'Onboarding templates', icon: UserPlus, testId: 'nav-onboarding-templates' },
    { page: 'offboarding-templates', label: 'Offboarding templates', icon: UserMinus, testId: 'nav-offboarding-templates' },
    { page: 'scheduled-actions', label: 'Scheduled Actions', icon: Clock, testId: 'nav-scheduled-actions' },
    { page: 'rules-engine', label: 'Rules Engine', icon: Zap, testId: 'nav-rules-engine' },
    { page: 'requests', label: 'Requests', icon: FileText, testId: 'nav-requests' },
    { page: 'tasks', label: 'My Tasks', icon: CheckSquare, testId: 'nav-tasks' },
    { page: 'training', label: 'Training', icon: GraduationCap, testId: 'nav-training' },
  ] },
  { title: 'Security', items: [
    { page: 'security-events', label: 'Security events', icon: AlertCircle, testId: 'nav-security-events' },
    { page: 'oauth-apps', label: 'OAuth apps', icon: AppWindow, testId: 'nav-oauth-apps' },
    { page: 'external-sharing', label: 'External sharing', icon: Share2, testId: 'nav-external-sharing' },
    { page: 'audit-logs', label: 'Audit log', icon: ClipboardList, testId: 'nav-audit-logs' },
    { page: 'email-security', label: 'Mail Search', icon: Search, testId: 'nav-email-security' },
    { page: 'licenses', label: 'Licenses', icon: Key, testId: 'nav-licenses' },
  ] },
  { title: 'Insights', items: [
    { page: 'hr-dashboard', label: 'HR Dashboard', icon: LayoutDashboard, testId: 'nav-hr-dashboard' },
    { page: 'manager-dashboard', label: 'Manager Dashboard', icon: UsersIcon, testId: 'nav-manager-dashboard' },
    { page: 'lifecycle-analytics', label: 'Analytics', icon: BarChart3, testId: 'nav-lifecycle-analytics' },
  ] },
  { title: 'Assets', items: [
    { page: 'assets', label: 'IT Assets', icon: Package, testId: 'nav-assets' },
    { page: 'files-assets', label: 'Media Files', icon: Image, testId: 'nav-files-assets' },
  ] },
  { title: null, items: [
    { page: 'settings', label: 'Settings', icon: SettingsIcon, testId: 'nav-settings' },
  ] },
];

export const USER_NAV: NavSectionDef[] = [
  { title: null, items: [
    { page: 'dashboard', label: 'Home', icon: Home, testId: 'nav-user-home' },
  ] },
  { title: 'Directory', items: [
    { page: 'people', label: 'People', icon: UsersRound, testId: 'nav-people' },
    { page: 'my-team', label: 'My Team', icon: UserCheck, testId: 'nav-my-team' },
    { page: 'my-groups', label: 'My Groups', icon: UsersIcon, testId: 'nav-my-groups' },
    { page: 'orgChart', label: 'Org Chart', icon: Network, testId: 'nav-org-chart' },
  ] },
  { title: 'Profile', items: [
    { page: 'my-profile', label: 'My Profile', icon: User, testId: 'nav-my-profile' },
    { page: 'my-onboarding', label: 'My Onboarding', icon: GraduationCap, testId: 'nav-my-onboarding' },
  ] },
  { title: null, items: [
    { page: 'user-settings', label: 'Settings', icon: SettingsIcon, testId: 'nav-user-settings' },
  ] },
];
