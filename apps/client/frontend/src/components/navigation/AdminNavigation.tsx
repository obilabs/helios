import React from 'react';
import {
  Home,
  Users as UsersIcon,
  UsersRound,
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
} from 'lucide-react';
import { useLabels } from '../../contexts/LabelsContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { ENTITIES } from '../../config/entities';

interface AdminNavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  sidebarCollapsed: boolean;
  labelsLoading: boolean;
}

/**
 * Admin Console Navigation
 *
 * Shows admin-only features:
 * - Dashboard (admin stats)
 * - Directory (Users, Groups, Org Chart)
 * - Journeys (Onboarding, Offboarding, Training, Requests, Tasks)
 * - Automation (Signatures, Scheduled Actions, Rules Engine)
 * - Insights (HR Dashboard, Manager Dashboard, Analytics)
 * - Assets (IT Assets, Media Files)
 * - Security (Mail Search, Security Events, Audit Logs, External Sharing)
 * - Settings
 */
export const AdminNavigation: React.FC<AdminNavigationProps> = ({
  currentPage,
  onNavigate,
  sidebarCollapsed: _sidebarCollapsed,
  labelsLoading,
}) => {
  const { labels, isEntityAvailable } = useLabels();
  const { isEnabled, anyEnabled } = useFeatureFlags();

  // Check if any items in a section are enabled
  const hasJourneysItems = anyEnabled(
    'nav.onboarding', 'nav.offboarding', 'nav.training', 'nav.requests', 'nav.tasks'
  );
  const hasAutomationItems = anyEnabled(
    'nav.signatures', 'nav.scheduled_actions', 'nav.rules_engine'
  );
  const hasInsightsItems = anyEnabled(
    'nav.hr_dashboard', 'nav.manager_dashboard', 'nav.lifecycle_analytics'
  );
  const hasAssetItems = anyEnabled('nav.it_assets', 'nav.media_files');
  const hasSecurityItems = anyEnabled('nav.mail_search', 'nav.security_events', 'nav.oauth_apps', 'nav.audit_logs', 'nav.licenses', 'nav.external_sharing');

  return (
    <nav className="nav">
      <button
        className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`}
        onClick={() => onNavigate('dashboard')}
        data-testid="nav-admin-dashboard"
      >
        <Home size={16} className="nav-icon" />
        <span>Dashboard</span>
      </button>

      <div className="nav-section" data-labels-loaded={labelsLoading ? 'false' : 'true'}>
        <div className="nav-section-title">Directory</div>

        {/* Users - Always available (core entity) */}
        <button
          className={`nav-item ${currentPage === 'users' ? 'active' : ''}`}
          onClick={() => onNavigate('users')}
          data-testid="nav-users"
        >
          <UsersIcon size={16} className="nav-icon" />
          <span>{labels[ENTITIES.USER]?.plural || 'Users'}</span>
        </button>

        {/* Access Groups - Only if GWS or M365 enabled */}
        {isEntityAvailable(ENTITIES.ACCESS_GROUP) && (
          <button
            className={`nav-item ${currentPage === 'groups' ? 'active' : ''}`}
            onClick={() => onNavigate('groups')}
            data-testid="nav-access-groups"
          >
            <UsersRound size={16} className="nav-icon" />
            <span>{labels[ENTITIES.ACCESS_GROUP]?.plural || 'Groups'}</span>
          </button>
        )}

        {/* Workspaces - Only if M365 or Google Chat enabled */}
        {isEntityAvailable(ENTITIES.WORKSPACE) && (
          <button
            className={`nav-item ${currentPage === 'workspaces' ? 'active' : ''}`}
            onClick={() => onNavigate('workspaces')}
            data-testid="nav-workspaces"
          >
            <MessageSquare size={16} className="nav-icon" />
            <span>{labels[ENTITIES.WORKSPACE]?.plural || 'Teams'}</span>
          </button>
        )}

        {/* Org Chart - Shows manager relationships */}
        <button
          className={`nav-item ${currentPage === 'orgChart' ? 'active' : ''}`}
          onClick={() => onNavigate('orgChart')}
          data-testid="nav-org-chart"
        >
          <Network size={16} className="nav-icon" />
          <span>Org Chart</span>
        </button>
      </div>

      {/* Journeys Section - Employee lifecycle journeys */}
      {isEnabled('nav.section.journeys') && hasJourneysItems && (
        <div className="nav-section">
          <div className="nav-section-title">Journeys</div>
          {isEnabled('nav.onboarding') && (
            <button
              className={`nav-item ${currentPage === 'onboarding-templates' ? 'active' : ''}`}
              onClick={() => onNavigate('onboarding-templates')}
              data-testid="nav-onboarding-templates"
            >
              <UserPlus size={16} className="nav-icon" />
              <span>Onboarding</span>
            </button>
          )}
          {isEnabled('nav.offboarding') && (
            <button
              className={`nav-item ${currentPage === 'offboarding-templates' ? 'active' : ''}`}
              onClick={() => onNavigate('offboarding-templates')}
              data-testid="nav-offboarding-templates"
            >
              <UserMinus size={16} className="nav-icon" />
              <span>Offboarding</span>
            </button>
          )}
          {isEnabled('nav.training') && (
            <button
              className={`nav-item ${currentPage === 'training' ? 'active' : ''}`}
              onClick={() => onNavigate('training')}
              data-testid="nav-training"
            >
              <GraduationCap size={16} className="nav-icon" />
              <span>Training</span>
            </button>
          )}
          {isEnabled('nav.requests') && (
            <button
              className={`nav-item ${currentPage === 'requests' ? 'active' : ''}`}
              onClick={() => onNavigate('requests')}
              data-testid="nav-requests"
            >
              <FileText size={16} className="nav-icon" />
              <span>Requests</span>
            </button>
          )}
          {isEnabled('nav.tasks') && (
            <button
              className={`nav-item ${currentPage === 'tasks' ? 'active' : ''}`}
              onClick={() => onNavigate('tasks')}
              data-testid="nav-tasks"
            >
              <CheckSquare size={16} className="nav-icon" />
              <span>My Tasks</span>
            </button>
          )}
        </div>
      )}

      {/* Automation Section - Configure-once tools */}
      {isEnabled('nav.section.automation') && hasAutomationItems && (
        <div className="nav-section">
          <div className="nav-section-title">Automation</div>
          {isEnabled('nav.signatures') && (
            <button
              className={`nav-item ${currentPage === 'signatures' ? 'active' : ''}`}
              onClick={() => onNavigate('signatures')}
              data-testid="nav-signatures"
            >
              <PenTool size={16} className="nav-icon" />
              <span>Signatures</span>
            </button>
          )}
          {isEnabled('nav.scheduled_actions') && (
            <button
              className={`nav-item ${currentPage === 'scheduled-actions' ? 'active' : ''}`}
              onClick={() => onNavigate('scheduled-actions')}
              data-testid="nav-scheduled-actions"
            >
              <Clock size={16} className="nav-icon" />
              <span>Scheduled Actions</span>
            </button>
          )}
          {isEnabled('nav.rules_engine') && (
            <button
              className={`nav-item ${currentPage === 'rules-engine' ? 'active' : ''}`}
              onClick={() => onNavigate('rules-engine')}
              data-testid="nav-rules-engine"
            >
              <Zap size={16} className="nav-icon" />
              <span>Rules Engine</span>
            </button>
          )}
        </div>
      )}

      {/* Insights Section - Dashboards and analytics */}
      {isEnabled('nav.section.insights') && hasInsightsItems && (
        <div className="nav-section">
          <div className="nav-section-title">Insights</div>
          {isEnabled('nav.hr_dashboard') && (
            <button
              className={`nav-item ${currentPage === 'hr-dashboard' ? 'active' : ''}`}
              onClick={() => onNavigate('hr-dashboard')}
              data-testid="nav-hr-dashboard"
            >
              <LayoutDashboard size={16} className="nav-icon" />
              <span>HR Dashboard</span>
            </button>
          )}
          {isEnabled('nav.manager_dashboard') && (
            <button
              className={`nav-item ${currentPage === 'manager-dashboard' ? 'active' : ''}`}
              onClick={() => onNavigate('manager-dashboard')}
              data-testid="nav-manager-dashboard"
            >
              <UsersIcon size={16} className="nav-icon" />
              <span>Manager Dashboard</span>
            </button>
          )}
          {isEnabled('nav.lifecycle_analytics') && (
            <button
              className={`nav-item ${currentPage === 'lifecycle-analytics' ? 'active' : ''}`}
              onClick={() => onNavigate('lifecycle-analytics')}
              data-testid="nav-lifecycle-analytics"
            >
              <BarChart3 size={16} className="nav-icon" />
              <span>Analytics</span>
            </button>
          )}
        </div>
      )}

      {/* Assets Section - Show if section flag enabled AND has any items */}
      {isEnabled('nav.section.assets') && hasAssetItems && (
        <div className="nav-section">
          <div className="nav-section-title">Assets</div>
          {isEnabled('nav.it_assets') && (
            <button
              className={`nav-item ${currentPage === 'assets' ? 'active' : ''}`}
              onClick={() => onNavigate('assets')}
              data-testid="nav-assets"
            >
              <Package size={16} className="nav-icon" />
              <span>IT Assets</span>
            </button>
          )}
          {isEnabled('nav.media_files') && (
            <button
              className={`nav-item ${currentPage === 'files-assets' ? 'active' : ''}`}
              onClick={() => onNavigate('files-assets')}
              data-testid="nav-files-assets"
            >
              <Image size={16} className="nav-icon" />
              <span>Media Files</span>
            </button>
          )}
        </div>
      )}

      {/* Security Section - Show if section flag enabled AND has any items */}
      {isEnabled('nav.section.security') && hasSecurityItems && (
        <div className="nav-section">
          <div className="nav-section-title">Security</div>
          {isEnabled('nav.mail_search') && (
            <button
              className={`nav-item ${currentPage === 'email-security' ? 'active' : ''}`}
              onClick={() => onNavigate('email-security')}
              data-testid="nav-email-security"
            >
              <Search size={16} className="nav-icon" />
              <span>Mail Search</span>
            </button>
          )}
          {isEnabled('nav.security_events') && (
            <button
              className={`nav-item ${currentPage === 'security-events' ? 'active' : ''}`}
              onClick={() => onNavigate('security-events')}
              data-testid="nav-security-events"
            >
              <AlertCircle size={16} className="nav-icon" />
              <span>Security Events</span>
            </button>
          )}
          {isEnabled('nav.oauth_apps') && (
            <button
              className={`nav-item ${currentPage === 'oauth-apps' ? 'active' : ''}`}
              onClick={() => onNavigate('oauth-apps')}
              data-testid="nav-oauth-apps"
            >
              <AppWindow size={16} className="nav-icon" />
              <span>OAuth Apps</span>
            </button>
          )}
          {isEnabled('nav.audit_logs') && (
            <button
              className={`nav-item ${currentPage === 'audit-logs' ? 'active' : ''}`}
              onClick={() => onNavigate('audit-logs')}
              data-testid="nav-audit-logs"
            >
              <ClipboardList size={16} className="nav-icon" />
              <span>Audit Logs</span>
            </button>
          )}
          {isEnabled('nav.licenses') && (
            <button
              className={`nav-item ${currentPage === 'licenses' ? 'active' : ''}`}
              onClick={() => onNavigate('licenses')}
              data-testid="nav-licenses"
            >
              <Key size={16} className="nav-icon" />
              <span>Licenses</span>
            </button>
          )}
          {isEnabled('nav.external_sharing') && (
            <button
              className={`nav-item ${currentPage === 'external-sharing' ? 'active' : ''}`}
              onClick={() => onNavigate('external-sharing')}
              data-testid="nav-external-sharing"
            >
              <Share2 size={16} className="nav-icon" />
              <span>External Sharing</span>
            </button>
          )}
        </div>
      )}

      <button
        className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
        data-testid="nav-settings"
      >
        <SettingsIcon size={16} className="nav-icon" />
        <span>Settings</span>
      </button>
    </nav>
  );
};

export default AdminNavigation;
