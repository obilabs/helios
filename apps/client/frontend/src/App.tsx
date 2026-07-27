import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom'
import { QueryProvider } from './providers/QueryProvider'
import { authFetch } from './config/api'
import { signOut, getSession } from './lib/auth-client'
import './App.css'
import { LoginPage } from './pages/LoginPage'
import { ClientUserMenu } from './components/ClientUserMenu'
import { AccountSetup } from './components/AccountSetup'
import { Settings } from './components/Settings'
// PlatformCard - available for future use
// import { PlatformCard } from './components/PlatformCard'
import { MetricCard } from './components/MetricCard'
import { DashboardCustomizer } from './components/DashboardCustomizer'
import { Administrators } from './components/Administrators'
import { Users } from './pages/Users'
import { Groups } from './pages/Groups'
// OrgUnits - available for future use
// import { OrgUnits } from './pages/OrgUnits'
import OrgChart from './pages/OrgChart'
import { AssetManagement } from './pages/AssetManagement'
import { Workspaces } from './pages/Workspaces'
import SecurityEvents from './pages/SecurityEvents'
import { OAuthApps } from './pages/OAuthApps'
import { EmailSecurity } from './pages/EmailSecurity'
import AuditLogs from './pages/AuditLogs'
import Licenses from './pages/Licenses'
import { MyProfile } from './pages/MyProfile'
import { People } from './pages/People'
import { MyTeam } from './pages/MyTeam'
import { MyGroups } from './pages/MyGroups'
import { UserSettings } from './pages/UserSettings'
import OnboardingTemplates from './pages/OnboardingTemplates'
import OffboardingTemplates from './pages/OffboardingTemplates'
import OnboardingTemplateEditor from './components/lifecycle/OnboardingTemplateEditor'
import OffboardingTemplateEditor from './components/lifecycle/OffboardingTemplateEditor'

// Lazy-loaded large page components for better initial bundle size
const DeveloperConsole = lazy(() => import('./pages/DeveloperConsole').then(m => ({ default: m.DeveloperConsole })))
const AddUser = lazy(() => import('./pages/AddUser').then(m => ({ default: m.AddUser })))
const FilesAssets = lazy(() => import('./pages/FilesAssets').then(m => ({ default: m.FilesAssets })))
const Signatures = lazy(() => import('./pages/Signatures'))
const NewUserOnboarding = lazy(() => import('./pages/NewUserOnboarding'))
const UserOffboarding = lazy(() => import('./pages/UserOffboarding'))
const ScheduledActions = lazy(() => import('./pages/admin/ScheduledActions'))
const TeamAnalytics = lazy(() => import('./pages/admin/TeamAnalytics'))
const ExternalSharingManager = lazy(() => import('./pages/admin/ExternalSharingManager'))
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const TasksDashboard = lazy(() => import('./pages/TasksDashboard'));
const TrainingContent = lazy(() => import('./pages/TrainingContent'));
const UserOnboardingPortal = lazy(() => import('./pages/UserOnboardingPortal'));
const HRDashboard = lazy(() => import('./pages/HRDashboard'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const LifecycleAnalytics = lazy(() => import('./pages/LifecycleAnalytics'));
const RulesEngine = lazy(() => import('./pages/RulesEngine'));
import { CommandBar } from './components/ai/CommandBar'
import { ChatPanel } from './components/ai/ChatPanel'
import { HelpWidget } from './components/ai/HelpWidget'
import { LabelsProvider, useLabels } from './contexts/LabelsContext'
import { ViewProvider, useView } from './contexts/ViewContext'
import { FeatureFlagsProvider, useFeatureFlags } from './contexts/FeatureFlagsContext'
import { ToastProvider } from './contexts/ToastContext'
import { AdminNavigation, UserNavigation, ViewSwitcher, ViewOnboarding } from './components/navigation'
// Button component removed - using styled quick-action-btn classes instead
import { EmailEngagementWidget } from './components/widgets/EmailEngagementWidget'
import { LoginMapWidget } from './components/widgets/LoginMapWidget'
import { getWidgetData } from './utils/widget-data'
import { getEnabledWidgets, type WidgetId } from './config/widgets'
import { UserPlus, Upload, Download, RefreshCw, AlertCircle, Info, Edit3, Bell, Building, Building2, HelpCircle, Search, Users as UsersIcon, Loader2, MessageSquare, User, Network, Settings as SettingsIcon } from 'lucide-react'

// Loading fallback for lazy-loaded components
const PageLoader = () => (
  <div className="page-loader">
    <Loader2 className="page-loader-spinner" size={32} />
    <span>Loading...</span>
  </div>
)

interface OrganizationConfig {
  organizationId: string;
  domain: string;
  organizationName: string;
  dwdConfigured: boolean;
  // Branding & Support (optional)
  logoClickUrl?: string;      // Where logo click goes (default: /admin/dashboard)
  supportUrl?: string;        // External support portal URL
  supportEmail?: string;      // Support email address
}

interface LicenseData {
  reportDate: string;
  total: number;
  used: number;
  byEdition: {
    [key: string]: {
      total: number;
      used: number;
    };
  };
}

interface GoogleWorkspaceStats {
  connected: boolean;
  totalUsers: number;
  suspendedUsers: number;
  adminUsers: number;
  lastSync: string | null;
  licenses: LicenseData | null;
}

interface Microsoft365Stats {
  connected: boolean;
  totalUsers: number;
  disabledUsers: number;
  adminUsers: number;
  lastSync: string | null;
  licenses: any | null;
}

interface HeliosStats {
  totalUsers: number;
  guestUsers: number;
  activeUsers: number;
  orphanedUsers?: number;
}

interface OrganizationStats {
  google: GoogleWorkspaceStats;
  microsoft: Microsoft365Stats;
  helios: HeliosStats;
}

// Helper to map URL paths to page identifiers for active nav highlighting
function getPageFromPath(pathname: string): string {
  // Admin routes (with /admin prefix)
  if (pathname === '/admin' || pathname === '/admin/dashboard') return 'dashboard';
  if (pathname.startsWith('/admin/users')) return 'users';
  if (pathname.startsWith('/admin/groups')) return 'groups';
  if (pathname.startsWith('/admin/org-chart')) return 'orgChart';
  if (pathname.startsWith('/admin/workspaces')) return 'workspaces';
  if (pathname.startsWith('/admin/assets')) return 'assets';
  if (pathname.startsWith('/admin/files-assets') || pathname.startsWith('/admin/media-files')) return 'files-assets';
  if (pathname.startsWith('/admin/email-security')) return 'email-security';
  if (pathname.startsWith('/admin/signatures')) return 'signatures';
  if (pathname.startsWith('/admin/security-events')) return 'security-events';
  if (pathname.startsWith('/admin/security/oauth-apps')) return 'oauth-apps';
  if (pathname.startsWith('/admin/audit-logs')) return 'audit-logs';
  if (pathname.startsWith('/admin/licenses')) return 'licenses';
  if (pathname.startsWith('/admin/external-sharing')) return 'external-sharing';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  if (pathname.startsWith('/admin/administrators')) return 'administrators';
  if (pathname.startsWith('/admin/console')) return 'console';
  // Automation routes
  if (pathname.startsWith('/admin/onboarding-templates')) return 'onboarding-templates';
  if (pathname.startsWith('/admin/offboarding-templates')) return 'offboarding-templates';
  if (pathname.startsWith('/admin/scheduled-actions')) return 'scheduled-actions';
  if (pathname.startsWith('/admin/training')) return 'training';
  if (pathname.startsWith('/admin/tasks')) return 'tasks';
  if (pathname.startsWith('/admin/requests')) return 'requests';
  if (pathname.startsWith('/admin/hr-dashboard')) return 'hr-dashboard';
  if (pathname.startsWith('/admin/manager-dashboard')) return 'manager-dashboard';
  if (pathname.startsWith('/admin/lifecycle-analytics')) return 'lifecycle-analytics';
  if (pathname.startsWith('/admin/rules-engine')) return 'rules-engine';
  // User lifecycle routes
  if (pathname.startsWith('/admin/onboarding/new') || pathname.startsWith('/new-user-onboarding')) return 'new-user-onboarding';
  if (pathname.startsWith('/admin/offboarding/user') || pathname.startsWith('/user-offboarding')) return 'user-offboarding';

  // User routes (at root level)
  if (pathname === '/' || pathname === '/home' || pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/people')) return 'people';
  if (pathname.startsWith('/my-team')) return 'my-team';
  if (pathname.startsWith('/my-groups')) return 'my-groups';
  if (pathname.startsWith('/my-profile')) return 'my-profile';
  if (pathname.startsWith('/my-onboarding')) return 'my-onboarding';
  if (pathname.startsWith('/user-settings')) return 'user-settings';

  // Special pages
  if (pathname.startsWith('/add-user')) return 'add-user';

  // Legacy routes (for backwards compatibility - these will redirect)
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/groups')) return 'groups';
  if (pathname.startsWith('/settings')) return 'settings';

  return 'dashboard';
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // Custom labels from LabelsContext
  const { refreshLabels, isLoading: labelsLoading } = useLabels();

  // View context for admin/user view switching
  const { currentView, setCapabilities } = useView();

  // Feature flags context for navigation visibility
  const { refresh: refreshFeatureFlags } = useFeatureFlags();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<OrganizationConfig | null>(null);
  const [step, setStep] = useState<'welcome' | 'setup' | 'login' | 'dashboard' | null>(null);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [_syncLoading, setSyncLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Check if we're in popup mode (for console)
  const urlParams = new URLSearchParams(location.search);
  const isPopupMode = urlParams.get('mode') === 'popup' && location.pathname.includes('/console');

  // Derive current page from URL path
  const currentPage = getPageFromPath(location.pathname);

  // Navigation helper that uses React Router - routes based on current view
  const setCurrentPage = (page: string) => {
    // Admin pages use /admin prefix
    const adminPathMap: Record<string, string> = {
      'dashboard': '/admin',
      'users': '/admin/users',
      'groups': '/admin/groups',
      'orgChart': '/admin/org-chart',
      'workspaces': '/admin/workspaces',
      'assets': '/admin/assets',
      'files-assets': '/admin/files-assets',
      'email-security': '/admin/email-security',
      'signatures': '/admin/signatures',
      'security-events': '/admin/security-events',
      'oauth-apps': '/admin/security/oauth-apps',
      'audit-logs': '/admin/audit-logs',
      'licenses': '/admin/licenses',
      'external-sharing': '/admin/external-sharing',
      'settings': '/admin/settings',
      'administrators': '/admin/administrators',
      'console': '/admin/console',
      // Automation routes
      'onboarding-templates': '/admin/onboarding-templates',
      'offboarding-templates': '/admin/offboarding-templates',
      'scheduled-actions': '/admin/scheduled-actions',
      'tasks': '/admin/tasks',
      'training': '/admin/training',
      'requests': '/admin/requests',
      'hr-dashboard': '/admin/hr-dashboard',
      'manager-dashboard': '/admin/manager-dashboard',
      'lifecycle-analytics': '/admin/lifecycle-analytics',
      'rules-engine': '/admin/rules-engine',
      // User management routes
      'add-user': '/add-user',
      'new-user-onboarding': '/admin/onboarding/new',
      'user-offboarding': '/admin/offboarding/user',
    };

    // User pages at root level
    const userPathMap: Record<string, string> = {
      'dashboard': '/',
      'home': '/',
      'people': '/people',
      'my-team': '/my-team',
      'my-groups': '/my-groups',
      'my-profile': '/my-profile',
      'my-onboarding': '/my-onboarding',
      'user-settings': '/user-settings',
    };

    // Use appropriate path map based on current view
    if (currentView === 'admin' && adminPathMap[page]) {
      navigate(adminPathMap[page]);
    } else if (userPathMap[page]) {
      navigate(userPathMap[page]);
    } else if (adminPathMap[page]) {
      // Fallback to admin path if user path not found
      navigate(adminPathMap[page]);
    } else {
      navigate('/');
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loginOrgName, setLoginOrgName] = useState<string>('');
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [universalSearch, setUniversalSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    users: Array<{ id: string; name: string; email: string }>;
    groups: Array<{ id: string; name: string; email: string }>;
    settings: Array<{ id: string; label: string; path: string }>;
  }>({ users: [], groups: [], settings: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>([]);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [widgetsError, setWidgetsError] = useState<string | null>(null);
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showHelpWidget, setShowHelpWidget] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Settings pages for universal search
  const settingsPages = [
    { id: 'modules', label: 'Modules - Google Workspace, Microsoft 365', path: '/admin/settings' },
    { id: 'organization', label: 'Organization Settings', path: '/admin/settings' },
    { id: 'security', label: 'Security Settings', path: '/admin/settings' },
    { id: 'advanced', label: 'Advanced - Sync & Data Settings', path: '/admin/settings' },
    { id: 'feature-flags', label: 'Feature Flags', path: '/admin/settings' },
    { id: 'users-page', label: 'Users Management', path: '/admin/users' },
    { id: 'groups-page', label: 'Groups Management', path: '/admin/groups' },
    { id: 'org-chart', label: 'Org Chart', path: '/admin/org-chart' },
    { id: 'audit-logs', label: 'Audit Logs', path: '/admin/audit-logs' },
    { id: 'signatures', label: 'Email Signatures', path: '/admin/signatures' },
  ];

  // Universal search effect
  useEffect(() => {
    if (!universalSearch.trim()) {
      setSearchResults({ users: [], groups: [], settings: [] });
      setShowSearchDropdown(false);
      return;
    }

    const query = universalSearch.toLowerCase();

    // Filter settings pages
    const matchedSettings = settingsPages.filter(s =>
      s.label.toLowerCase().includes(query)
    ).slice(0, 3);

    setSearchResults(prev => ({ ...prev, settings: matchedSettings }));
    setShowSearchDropdown(true);

    // Debounce API calls
    const timeoutId = setTimeout(async () => {
      if (!config?.organizationId) return;

      setSearchLoading(true);
      try {
        // Search users
        const usersRes = await authFetch(`/api/v1/organization/users?organizationId=${config.organizationId}&search=${encodeURIComponent(query)}&limit=5`);
        const usersData = await usersRes.json();
        const users = (usersData.data || []).slice(0, 5).map((u: any) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email
        }));

        // Search groups
        const groupsRes = await authFetch(`/api/v1/google-workspace/groups?organizationId=${config.organizationId}`);
        const groupsData = await groupsRes.json();
        const groups = (groupsData.data || [])
          .filter((g: any) => g.name?.toLowerCase().includes(query) || g.email?.toLowerCase().includes(query))
          .slice(0, 5)
          .map((g: any) => ({
            id: g.id,
            name: g.name,
            email: g.email
          }));

        setSearchResults(prev => ({ ...prev, users, groups }));
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [universalSearch, config?.organizationId]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.closest('.search-container')?.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    checkConfiguration();
  }, []);

  // Fetch organization name for login screen
  useEffect(() => {
    if (step === 'login' && !loginOrgName) {
      const fetchOrgInfo = async () => {
        try {
          const response = await fetch('/api/v1/organization/current');
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              setLoginOrgName(data.data.name);
            }
          }
        } catch (err) {
        }
      };
      fetchOrgInfo();
    }
  }, [step, loginOrgName]);

  // No need to save currentPage to localStorage - React Router handles URL state

  // Track previous view to detect actual view changes (not initial render)
  const prevViewRef = useRef<string | null>(null);

  // Navigate when view changes (admin <-> user)
  // This ensures the user lands on the appropriate default page for their new view
  useEffect(() => {
    // Only run when authenticated (dashboard step)
    if (step !== 'dashboard') return;

    // Skip initial render - only navigate on actual view changes
    if (prevViewRef.current === null) {
      prevViewRef.current = currentView;
      return;
    }

    // If view actually changed, navigate to appropriate default page
    if (prevViewRef.current !== currentView) {
      prevViewRef.current = currentView;

      if (currentView === 'admin') {
        // Navigate to admin dashboard
        navigate('/admin');
      } else if (currentView === 'user') {
        // Navigate to user dashboard
        navigate('/');
      }
    }
  }, [currentView, step, navigate]);

  // Command Bar keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandBar(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check AI status function (reusable for initial load and after config changes)
  const checkAiStatus = async () => {
    if (step !== 'dashboard') return;
    try {
      const response = await authFetch('/api/v1/ai/status');
      const data = await response.json();
      if (data.success) {
        setAiEnabled(data.data.available);
      }
    } catch {
      // Ignore errors
    }
  };

  // Check AI status when authenticated
  useEffect(() => {
    checkAiStatus();
  }, [step]);

  const checkConfiguration = async () => {
    try {
      setLoading(true);

      // Check if user has an active session (session-based auth)
      const storedOrg = localStorage.getItem('helios_organization');
      const storedUser = localStorage.getItem('helios_user');

      // Try to get the current session from better-auth
      try {
        const session = await getSession();

        if (session?.session && storedOrg) {
          // User has an active session, set up dashboard
          const orgData = JSON.parse(storedOrg);
          setConfig({
            organizationId: orgData.organizationId,
            domain: orgData.domain,
            organizationName: orgData.organizationName,
            dwdConfigured: false
          });

          // Load user data
          if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
          }

          setStep('dashboard');
          fetchOrganizationStats(orgData.organizationId);
          loadUserPreferences();
          return;
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      }

      // No valid session, clear stored data
      localStorage.removeItem('helios_organization');
      localStorage.removeItem('helios_user');

      // Check if organization is set up (determines setup vs login)
      const checkResponse = await fetch('/api/v1/organization/setup/status');
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        if (checkData.data && checkData.data.isSetupComplete) {
          // Organization exists, show login screen
          setStep('login'); // Show login screen since organization exists
        } else {
          setStep('setup'); // Go directly to account setup
        }
      } else {
        setStep('setup');
      }

    } catch (err) {
      console.error('Config check failed:', err);
      // On error, default to setup page rather than welcome
      // This prevents the flash of welcome page on network errors
      setStep('setup');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizationStats = async (_organizationId: string) => {
    setStatsLoading(true);
    setStatsError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await authFetch('/api/v1/dashboard/stats', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('Failed to fetch dashboard stats: HTTP', response.status);
        setStatsError(`Failed to load stats (HTTP ${response.status})`);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setStats(data.data);
        setStatsError(null);
      } else {
        setStatsError(data.error || 'Failed to load dashboard stats');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Dashboard stats request timed out');
        setStatsError('Request timed out. Please refresh the page.');
      } else {
        console.error('Failed to fetch dashboard stats:', err);
        setStatsError('Unable to connect to the server. Please check your connection.');
      }
    } finally {
      setStatsLoading(false);
    }
  };

  // Load user preferences for dashboard widgets
  const loadUserPreferences = async () => {
    setWidgetsLoading(true);
    setWidgetsError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await authFetch('/api/v1/dashboard/widgets', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('Failed to load dashboard widgets: HTTP', response.status);
        // Use defaults on HTTP error
        const defaultWidgets = getEnabledWidgets();
        setVisibleWidgets(defaultWidgets.map(w => w.id));
        return;
      }

      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        // Map widget data to widget IDs, filtering visible ones
        const widgetIds = data.data
          .filter((w: any) => w.isVisible !== false)
          .sort((a: any, b: any) => a.position - b.position)
          .map((w: any) => w.widgetId);
        setVisibleWidgets(widgetIds);
      } else {
        // No saved preferences, use defaults
        const defaultWidgets = getEnabledWidgets();
        setVisibleWidgets(defaultWidgets.map(w => w.id));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('Dashboard widgets request timed out');
        setWidgetsError('Request timed out. Using default widgets.');
      } else {
        console.error('Failed to load dashboard widgets:', err);
      }
      // On error, use defaults
      const defaultWidgets = getEnabledWidgets();
      setVisibleWidgets(defaultWidgets.map(w => w.id));
    } finally {
      setWidgetsLoading(false);
    }
  };

  // Save dashboard widget preferences
  const saveWidgetPreferences = async (widgets: WidgetId[]) => {
    try {
      // Map widgets to the format expected by the backend
      const widgetData = widgets.map((widgetId, index) => ({
        widgetId,
        position: index,
        isVisible: true,
        config: {}
      }));

      const response = await authFetch('/api/v1/dashboard/widgets', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ widgets: widgetData })
      });

      const data = await response.json();

      if (data.success) {
        setVisibleWidgets(widgets);
      } else {
        alert('Failed to save widget preferences');
      }
    } catch (err) {
      console.error('Failed to save widget preferences:', err);
      alert('Failed to save widget preferences');
    }
  };

  const handleManualSync = async () => {
    if (!config?.organizationId) return;

    try {
      setSyncLoading(true);

      // Start sync in background
      const response = await authFetch('/api/v1/google-workspace/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: config.organizationId })
      });

      const data = await response.json();

      if (data.success) {
        // Show toast notification instead of blocking
        console.log('Sync started in background');

        // Poll for updates every 3 seconds
        const pollInterval = setInterval(async () => {
          await fetchOrganizationStats(config.organizationId);
        }, 3000);

        // Stop polling after 30 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          setSyncLoading(false);
        }, 30000);
      } else {
        alert(`Sync failed: ${data.message}`);
        setSyncLoading(false);
      }
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
      setSyncLoading(false);
    }
  };

  if (loading || step === null) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Helios Client Portal...</p>
        </div>
      </div>
    );
  }

  if (step === 'setup') {
    return (
      <AccountSetup
        onComplete={(autoLogin) => {
          console.log('[App] AccountSetup onComplete called', autoLogin ? 'with autoLogin data' : 'without data');

          try {
            if (autoLogin) {
              // Auto-login with the returned token
              localStorage.setItem('helios_token', autoLogin.token);
              localStorage.setItem('helios_user', JSON.stringify({
                ...autoLogin.user,
                organizationId: autoLogin.organization.id
              }));

              // Set user state
              setCurrentUser({
                ...autoLogin.user,
                organizationId: autoLogin.organization.id
              });

              // Set capabilities (new admin is always admin + employee)
              setCapabilities({
                isAdmin: true,
                isEmployee: true,
              });

              // Set organization config
              setConfig({
                organizationId: autoLogin.organization.id,
                domain: autoLogin.organization.domain,
                organizationName: autoLogin.organization.name,
                dwdConfigured: false
              });

              // Refresh labels and feature flags then go to dashboard
              Promise.all([refreshLabels(), refreshFeatureFlags()])
                .then(async () => {
                  console.log('[App] Labels and flags refreshed, going to dashboard');
                  setStep('dashboard');

                  // Fetch organization stats and load widget preferences
                  await Promise.all([
                    fetchOrganizationStats(autoLogin.organization.id),
                    loadUserPreferences()
                  ]);
                })
                .catch(async (err) => {
                  console.error('[App] Error refreshing labels/flags:', err);
                  // Still go to dashboard even if labels/flags fail
                  setStep('dashboard');
                  // Still try to load dashboard data
                  await Promise.all([
                    fetchOrganizationStats(autoLogin.organization.id),
                    loadUserPreferences()
                  ]).catch(() => {});
                });
            } else {
              // Fallback to login if no auto-login data
              console.log('[App] No autoLogin data, going to login');
              setStep('login');
            }
          } catch (err) {
            console.error('[App] Error in onComplete:', err);
            // Fallback to login on any error
            setStep('login');
          }
        }}
      />
    );
  }

  if (step === 'login') {
    return (
      <LoginPage
        onLoginSuccess={(loginData) => {
          setCurrentUser(loginData.data.user);

          // Set user capabilities for view switching
          // Use access flags from API if available, otherwise derive from role
          const user = loginData.data.user;
          setCapabilities({
            isAdmin: user.isAdmin ?? (user.role === 'admin' || user.role === 'super_admin'),
            isEmployee: user.isEmployee ?? true, // Default to true if not specified
          });

          // Use organization info from login response (backend now includes it)
          if (loginData.data.organization) {
            setConfig({
              organizationId: loginData.data.organization.id,
              domain: loginData.data.organization.domain,
              organizationName: loginData.data.organization.name,
              dwdConfigured: false
            });
          }

          // Refresh labels and feature flags now that we have a token (before showing dashboard!)
          Promise.all([refreshLabels(), refreshFeatureFlags()]).then(async () => {
            setStep('dashboard');

            // Fetch organization stats and user preferences after dashboard shown
            // Run both in parallel but await completion to avoid race conditions
            if (loginData.data.organization) {
              await Promise.all([
                fetchOrganizationStats(loginData.data.organization.id),
                loadUserPreferences()
              ]);
            }
          });
        }}
        organizationName={loginOrgName || 'Your Organization'}
      />
    );
  }

  if (step === 'welcome') {
    return (
      <div className="app">
        <div className="welcome-container">
          <div className="welcome-card">
            <div className="welcome-header">
              <h1>🚀 Helios Admin Portal</h1>
              <p className="tagline">Unified SaaS Administration Platform</p>
            </div>

            <div className="welcome-body">
              <div className="feature-grid">
                <div className="feature-card">
                  <div className="feature-icon"><UsersIcon size={24} /></div>
                  <h3>SaaS User Management</h3>
                  <p>Centrally manage users across Google Workspace and other SaaS platforms</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">🔐</div>
                  <h3>Secure Integration</h3>
                  <p>Domain-Wide Delegation and OAuth for enterprise-grade security</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">⚡</div>
                  <h3>Automation & Workflows</h3>
                  <p>Automate user lifecycle, provisioning, and cross-platform operations</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">📊</div>
                  <h3>Unified Analytics</h3>
                  <p>Cross-platform reporting and compliance monitoring</p>
                </div>
              </div>

              <div className="welcome-cta">
                <button
                  className="btn-primary btn-large"
                  onClick={() => setStep('setup')}
                >
                  Get Started →
                </button>
                <p className="opensource-badge">
                  ⭐ Open Source (MIT) • Self-Host Free • Hosting from $49/mo
                </p>
              </div>

              <div className="info-banner">
                <strong>🎉 Welcome to Helios Admin Portal!</strong>
                <p>
                  Self-hosted administration platform for Google Workspace.
                  Sync users, groups, and organizational units with ease.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Popup mode: Render only the console without header/sidebar
  if (isPopupMode && currentPage === 'console') {
    return (
      <div className="popup-console-app">
        <Suspense fallback={<PageLoader />}>
          <DeveloperConsole organizationId={config?.organizationId || ''} isPopup={true} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="client-header">
        <div className="header-left">
          <a
            href={config?.logoClickUrl || (currentUser?.isAdmin ? '/admin/dashboard' : '/user/dashboard')}
            className="org-branding-link"
            onClick={(e) => {
              // If it's an internal link, use navigation instead of full page load
              const defaultUrl = currentUser?.isAdmin ? '/admin/dashboard' : '/user/dashboard';
              const url = config?.logoClickUrl || defaultUrl;
              if (url.startsWith('/')) {
                e.preventDefault();
                navigate(url);
              }
              // External URLs open naturally
            }}
          >
            <div className="org-logo"><Building size={24} /></div>
            <div className="org-info">
              <div className="org-name">{config?.organizationName || 'Organization'}</div>
              <div className="platform-name">Helios Admin Portal</div>
            </div>
          </a>
        </div>
        <div className="header-center">
          <div className="search-container">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search users, groups, settings..."
              className="universal-search"
              value={universalSearch}
              onChange={(e) => setUniversalSearch(e.target.value)}
              onFocus={() => universalSearch.trim() && setShowSearchDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && universalSearch.trim()) {
                  navigate(`/admin/users?search=${encodeURIComponent(universalSearch.trim())}`);
                  setUniversalSearch('');
                  setShowSearchDropdown(false);
                }
                if (e.key === 'Escape') {
                  setShowSearchDropdown(false);
                }
              }}
            />
            <span className="search-icon">
              {searchLoading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            </span>
            {showSearchDropdown && (searchResults.users.length > 0 || searchResults.groups.length > 0 || searchResults.settings.length > 0) && (
              <div className="search-dropdown">
                {searchResults.settings.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Pages</div>
                    {searchResults.settings.map(s => (
                      <button
                        key={s.id}
                        className="search-result-item"
                        onClick={() => {
                          navigate(s.path);
                          setUniversalSearch('');
                          setShowSearchDropdown(false);
                        }}
                      >
                        <SettingsIcon size={14} />
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.users.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Users</div>
                    {searchResults.users.map(u => (
                      <button
                        key={u.id}
                        className="search-result-item"
                        onClick={() => {
                          navigate(`/admin/users?search=${encodeURIComponent(u.email)}`);
                          setUniversalSearch('');
                          setShowSearchDropdown(false);
                        }}
                      >
                        <User size={14} />
                        <span className="result-name">{u.name}</span>
                        <span className="result-email">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.groups.length > 0 && (
                  <div className="search-section">
                    <div className="search-section-title">Groups</div>
                    {searchResults.groups.map(g => (
                      <button
                        key={g.id}
                        className="search-result-item"
                        onClick={() => {
                          navigate('/admin/groups');
                          setUniversalSearch('');
                          setShowSearchDropdown(false);
                        }}
                      >
                        <UsersIcon size={14} />
                        <span className="result-name">{g.name}</span>
                        <span className="result-email">{g.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <ViewSwitcher />
          <div className="welcome-stats">
            <span className="welcome-text">Welcome, {currentUser?.firstName || 'User'}!</span>
          </div>
          <button
            className={`icon-btn ai-chat-btn ${!aiEnabled ? 'disabled' : ''}`}
            title={aiEnabled ? "AI Assistant (Chat)" : "AI Assistant (Not configured)"}
            onClick={() => setShowChatPanel(true)}
          >
            <MessageSquare size={18} />
          </button>
          <button className="icon-btn" title="Help" onClick={() => setShowHelpWidget(!showHelpWidget)}><HelpCircle size={18} /></button>
          <button className="icon-btn" title="Notifications"><Bell size={18} /></button>
          <ClientUserMenu
            userName={currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'User'}
            userEmail={currentUser?.email || 'user@domain.com'}
            userRole={currentUser?.role || 'user'}
            onChangePassword={() => {
              setCurrentPage('settings');
              setShowPasswordModal(true);
            }}
            onNavigateToSettings={() => {
              setCurrentPage('settings');
            }}
            onNavigateToUserSettings={() => {
              setCurrentPage('user-settings');
            }}
            onNavigateToAdministrators={() => {
              setCurrentPage('administrators');
            }}
            onNavigateToConsole={() => {
              setCurrentPage('console');
            }}
            onNavigateToMyProfile={() => {
              setCurrentPage('my-profile');
            }}
            onLogout={async () => {
              try {
                // Sign out via better-auth (clears httpOnly session cookie)
                await signOut();
              } catch (err) {
                console.warn('Logout failed:', err);
              }

              // Clear all stored data (non-sensitive metadata only)
              localStorage.removeItem('helios_organization');
              localStorage.removeItem('helios_user');
              localStorage.removeItem('helios_client_config');

              // Reset to check configuration again
              setConfig(null);
              setStats(null);
              setCurrentUser(null);
              checkConfiguration();
            }}
          />
        </div>
      </header>

      <div className="client-layout">
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '→' : '←'}
            </button>
          </div>
          {/* View-aware navigation - show admin or user navigation based on current view */}
          {currentView === 'admin' ? (
            <AdminNavigation
              currentPage={currentPage}
              onNavigate={(page) => {
                setCurrentPage(page);
                if (page === 'dashboard' && config?.organizationId) {
                  fetchOrganizationStats(config.organizationId);
                }
              }}
              sidebarCollapsed={sidebarCollapsed}
              labelsLoading={labelsLoading}
            />
          ) : (
            <UserNavigation
              currentPage={currentPage}
              onNavigate={setCurrentPage}
              sidebarCollapsed={sidebarCollapsed}
            />
          )}
        </aside>

        <main className="client-main">
          {currentPage === 'dashboard' && currentView === 'admin' && (
            <div className="dashboard-content">
              <div className="dashboard-header">
                <div className="dashboard-title">
                  <h1>Dashboard</h1>
                  <p className="dashboard-subtitle">Welcome to your Helios Admin Portal</p>
                </div>
              </div>

              {/* Dashboard Controls */}
              <div className="dashboard-controls">
                <button className="customize-dashboard-btn" onClick={() => setShowCustomizer(true)}>
                  <Edit3 size={16} />
                  Customize Dashboard
                </button>
              </div>

              {/* Dashboard Widget Grid */}
              <div className="dashboard-widget-grid">
                {widgetsLoading || statsLoading ? (
                  <div style={{ gridColumn: 'span 12', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
                    Loading dashboard...
                  </div>
                ) : widgetsError ? (
                  <div style={{ gridColumn: 'span 12', textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
                    <AlertCircle size={20} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {widgetsError}
                  </div>
                ) : statsError ? (
                  <div style={{ gridColumn: 'span 12', textAlign: 'center', padding: '2rem', color: '#d97706', background: '#fef3c7', borderRadius: '8px' }}>
                    <AlertCircle size={20} style={{ display: 'inline-block', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {statsError}
                    <button
                      onClick={() => config?.organizationId && fetchOrganizationStats(config.organizationId)}
                      style={{ marginLeft: '1rem', padding: '4px 12px', fontSize: '13px', background: 'white', border: '1px solid #d97706', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Retry
                    </button>
                  </div>
                ) : visibleWidgets.length === 0 ? (
                  <div style={{ gridColumn: 'span 12', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    No widgets configured. Click "Customize Dashboard" to add widgets.
                  </div>
                ) : (
                  visibleWidgets.map(widgetId => {
                    const widgetData = getWidgetData(widgetId, stats, () => {
                      // Widget click handler - navigate to appropriate page
                      if (widgetId.startsWith('google-') || widgetId.startsWith('microsoft-')) {
                        setCurrentPage('settings');
                      } else if (widgetId.startsWith('helios-')) {
                        setCurrentPage('users');
                      }
                    });

                    if (!widgetData) return null;

                    return (
                      <MetricCard
                        key={widgetId}
                        icon={widgetData.icon}
                        title={widgetData.title}
                        value={widgetData.value}
                        label={widgetData.label}
                        footer={widgetData.footer}
                        state={widgetData.state}
                        size={widgetData.size}
                        platformColor={widgetData.platformColor}
                        gridColumn={widgetData.gridColumn}
                        onClick={widgetData.onClick}
                      />
                    );
                  })
                )}
              </div>

              {/* Dashboard Customizer Modal */}
              <DashboardCustomizer
                isOpen={showCustomizer}
                onClose={() => setShowCustomizer(false)}
                selectedWidgets={visibleWidgets}
                onSave={saveWidgetPreferences}
                connectedPlatforms={{
                  google: stats?.google?.connected || false,
                  microsoft: stats?.microsoft?.connected || false,
                }}
              />

              {/* Quick Actions Section */}
              <div className="quick-actions-section">
                <h2 className="section-title">Quick Actions</h2>
                <div className="quick-actions-grid">
                  <button className="quick-action-btn primary" onClick={() => navigate('/add-user')}>
                    <UserPlus size={18} />
                    Add User
                  </button>
                  <button className="quick-action-btn" onClick={() => setCurrentPage('users')}>
                    <Upload size={18} />
                    Import CSV
                  </button>
                  <button className="quick-action-btn" onClick={() => setCurrentPage('users')}>
                    <Download size={18} />
                    Export Report
                  </button>
                </div>
              </div>

              {/* Two Column Layout for Activity and Alerts */}
              <div className="dashboard-two-column">

                {/* Recent Activity Section */}
                <div className="dashboard-card activity-card">
                  <h2 className="section-title">Recent Activity</h2>
                  <div className="activity-list">
                    {stats?.google?.lastSync || stats?.microsoft?.lastSync ? (
                      <>
                        {stats.google?.lastSync && (
                          <>
                            <div className="activity-item">
                              <div className="activity-icon success">
                                <RefreshCw size={14} />
                              </div>
                              <div className="activity-content">
                                <div className="activity-text">Google Workspace sync completed</div>
                                <div className="activity-time">{new Date(stats.google.lastSync).toLocaleString()}</div>
                              </div>
                            </div>
                            {stats.google.totalUsers > 0 && (
                              <div className="activity-item">
                                <div className="activity-icon info">
                                  <UsersIcon size={14} />
                                </div>
                                <div className="activity-content">
                                  <div className="activity-text">Synced {stats.google.totalUsers} users from Google Workspace</div>
                                  <div className="activity-time">{new Date(stats.google.lastSync).toLocaleString()}</div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {/* Microsoft 365 sync activity - Coming Soon */}
                      </>
                    ) : (
                      <div className="empty-state">
                        <Info size={32} className="empty-icon" />
                        <p className="empty-title">No sync activity yet</p>
                        <p className="empty-subtitle">
                          {stats?.google?.connected
                            ? 'Run your first sync to see activity here.'
                            : 'Connect Google Workspace or Microsoft 365 to sync users.'}
                        </p>
                        {stats?.google?.connected && !stats.google.lastSync && (
                          <div className="empty-actions">
                            <button className="quick-action-btn primary" onClick={handleManualSync}>
                              <RefreshCw size={16} />
                              Run first sync
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Alerts Section - Only Real Alerts */}
                <div className="dashboard-card alerts-card">
                  <h2 className="section-title">Alerts</h2>
                  <div className="alerts-list">
                    {stats?.google?.suspendedUsers && stats.google.suspendedUsers > 0 && (
                      <div className="alert-item warning">
                        <AlertCircle size={16} className="alert-icon" />
                        <div className="alert-content">
                          <div className="alert-text">
                            <strong>{stats.google.suspendedUsers} suspended {stats.google.suspendedUsers === 1 ? 'user' : 'users'}</strong> in Google Workspace - Review and restore or remove
                          </div>
                          <button className="alert-action" onClick={() => setCurrentPage('users')}>Review Users</button>
                        </div>
                      </div>
                    )}

                    {stats?.helios?.orphanedUsers && stats.helios.orphanedUsers > 0 && (
                      <div className="alert-item warning">
                        <AlertCircle size={16} className="alert-icon" />
                        <div className="alert-content">
                          <div className="alert-text">
                            <strong>{stats.helios.orphanedUsers} {stats.helios.orphanedUsers === 1 ? 'user has' : 'users have'} no manager assigned</strong> - Assign managers for org chart accuracy
                          </div>
                          <button className="alert-action" onClick={() => setCurrentPage('org-chart')}>View Org Chart</button>
                        </div>
                      </div>
                    )}

                    {stats?.google?.connected && !stats.google.lastSync && (
                      <div className="alert-item info">
                        <Info size={16} className="alert-icon" />
                        <div className="alert-content">
                          <div className="alert-text">Initial Google Workspace sync recommended</div>
                          <button className="alert-action" onClick={handleManualSync}>Sync</button>
                        </div>
                      </div>
                    )}

                    {/* Microsoft 365 alerts - Coming Soon */}

                    {!stats?.google?.connected && stats?.helios && stats.helios.totalUsers === 0 && (
                      <div className="alert-item info">
                        <Info size={16} className="alert-icon" />
                        <div className="alert-content">
                          <div className="alert-text">Google Workspace not connected yet</div>
                          <button className="alert-action" onClick={() => setCurrentPage('settings')}>Setup</button>
                        </div>
                      </div>
                    )}

                    {(!stats?.google?.suspendedUsers || stats.google.suspendedUsers === 0) &&
                      (!stats?.helios?.orphanedUsers || stats.helios.orphanedUsers === 0) &&
                      stats?.google?.lastSync && (
                        <div className="empty-state">
                          <Info size={24} className="empty-icon" />
                          <p>No alerts at this time</p>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* Email Engagement Widget */}
              <div className="dashboard-engagement-section">
                <EmailEngagementWidget />
              </div>

              {/* Login Map Widget - Security monitoring */}
              {stats?.google?.connected && (
                <div className="dashboard-security-section">
                  <h2 className="section-title">Security Overview</h2>
                  <LoginMapWidget />
                </div>
              )}
            </div>
          )}

          {/* User Dashboard - shown when in user view */}
          {(currentPage === 'dashboard' || currentPage === 'home') && currentView === 'user' && (
            <div className="dashboard-content user-dashboard">
              <div className="dashboard-header">
                <div className="dashboard-title">
                  <h1>Welcome Back</h1>
                  <p className="dashboard-subtitle">
                    {currentUser?.firstName ? `Hello, ${currentUser.firstName}!` : 'Your personal workspace'}
                  </p>
                </div>
              </div>

              {/* User Quick Actions */}
              <div className="quick-actions-section">
                <h2 className="section-title">Quick Actions</h2>
                <div className="quick-actions-grid">
                  <button className="quick-action-btn primary" onClick={() => setCurrentPage('my-profile')}>
                    <User size={18} />
                    My Profile
                  </button>
                  <button className="quick-action-btn" onClick={() => setCurrentPage('people')}>
                    <UsersIcon size={18} />
                    People Directory
                  </button>
                  <button className="quick-action-btn" onClick={() => setCurrentPage('my-team')}>
                    <Building2 size={18} />
                    My Team
                  </button>
                  <button className="quick-action-btn" onClick={() => setCurrentPage('my-groups')}>
                    <UsersIcon size={18} />
                    My Groups
                  </button>
                </div>
              </div>

              {/* User Info Cards */}
              <div className="dashboard-two-column">
                <div className="dashboard-card">
                  <h2 className="section-title">My Information</h2>
                  <div className="user-info-summary">
                    {currentUser ? (
                      <>
                        <div className="info-row">
                          <span className="info-label">Name</span>
                          <span className="info-value">{currentUser.firstName} {currentUser.lastName}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Email</span>
                          <span className="info-value">{currentUser.email}</span>
                        </div>
                        {currentUser.jobTitle && (
                          <div className="info-row">
                            <span className="info-label">Job Title</span>
                            <span className="info-value">{currentUser.jobTitle}</span>
                          </div>
                        )}
                        {currentUser.department && (
                          <div className="info-row">
                            <span className="info-label">Department</span>
                            <span className="info-value">{currentUser.department}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted">Loading user information...</p>
                    )}
                  </div>
                </div>

                <div className="dashboard-card">
                  <h2 className="section-title">Getting Started</h2>
                  <div className="getting-started-list">
                    <div className="getting-started-item" onClick={() => setCurrentPage('my-profile')}>
                      <User size={16} />
                      <span>Complete your profile</span>
                    </div>
                    <div className="getting-started-item" onClick={() => setCurrentPage('people')}>
                      <UsersIcon size={16} />
                      <span>Browse the people directory</span>
                    </div>
                    <div className="getting-started-item" onClick={() => setCurrentPage('orgChart')}>
                      <Network size={16} />
                      <span>View the org chart</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentPage === 'settings' && (
            <Settings
              organizationName={config?.organizationName || 'Organization'}
              domain={config?.domain || 'domain.com'}
              organizationId={config?.organizationId || ''}
              showPasswordModal={showPasswordModal}
              onPasswordModalChange={setShowPasswordModal}
              currentUser={currentUser}
              onAIConfigChange={checkAiStatus}
            />
          )}

          {currentPage === 'users' && (
            <Users
              organizationId={config?.organizationId || ''}
              onNavigate={setCurrentPage}
            />
          )}

          {currentPage === 'administrators' && (
            <Administrators />
          )}

          {currentPage === 'groups' && (
            <Groups
              organizationId={config?.organizationId || ''}
            />
          )}

          {currentPage === 'workspaces' && (
            <Workspaces organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'orgChart' && (
            <OrgChart />
          )}

          {currentPage === 'assets' && (
            <AssetManagement organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'files-assets' && (
            <Suspense fallback={<PageLoader />}>
              <FilesAssets organizationId={config?.organizationId || ''} />
            </Suspense>
          )}

          {currentPage === 'email-security' && (
            <EmailSecurity />
          )}

          {currentPage === 'signatures' && (
            <Suspense fallback={<PageLoader />}>
              <Signatures />
            </Suspense>
          )}

          {currentPage === 'security-events' && (
            <SecurityEvents />
          )}

          {currentPage === 'oauth-apps' && (
            <OAuthApps organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'audit-logs' && (
            <AuditLogs />
          )}

          {currentPage === 'licenses' && (
            <Licenses />
          )}

          {currentPage === 'external-sharing' && (
            <Suspense fallback={<PageLoader />}>
              <ExternalSharingManager />
            </Suspense>
          )}

          {currentPage === 'console' && (
            <Suspense fallback={<PageLoader />}>
              <DeveloperConsole organizationId={config?.organizationId || ''} />
            </Suspense>
          )}

          {currentPage === 'my-profile' && (
            <MyProfile organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'people' && (
            <People organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'my-team' && (
            <MyTeam organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'my-groups' && (
            <MyGroups organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'user-settings' && (
            <UserSettings organizationId={config?.organizationId || ''} />
          )}

          {currentPage === 'add-user' && (
            <Suspense fallback={<PageLoader />}>
              <AddUser />
            </Suspense>
          )}

          {currentPage === 'onboarding-templates' && (
            <OnboardingTemplates
              organizationId={config?.organizationId || ''}
              onNavigateToEditor={(templateId) => {
                setCurrentPage(templateId ? 'edit-onboarding-template' : 'new-onboarding-template');
                // Store templateId for editor
                if (templateId) {
                  sessionStorage.setItem('editOnboardingTemplateId', templateId);
                } else {
                  sessionStorage.removeItem('editOnboardingTemplateId');
                }
              }}
            />
          )}

          {(currentPage === 'new-onboarding-template' || currentPage === 'edit-onboarding-template') && (
            <OnboardingTemplateEditor
              templateId={currentPage === 'edit-onboarding-template' ? sessionStorage.getItem('editOnboardingTemplateId') || undefined : undefined}
              organizationId={config?.organizationId || ''}
              onSave={() => {
                setCurrentPage('onboarding-templates');
                sessionStorage.removeItem('editOnboardingTemplateId');
              }}
              onCancel={() => {
                setCurrentPage('onboarding-templates');
                sessionStorage.removeItem('editOnboardingTemplateId');
              }}
            />
          )}

          {currentPage === 'offboarding-templates' && (
            <OffboardingTemplates
              organizationId={config?.organizationId || ''}
              onNavigateToEditor={(templateId) => {
                setCurrentPage(templateId ? 'edit-offboarding-template' : 'new-offboarding-template');
                // Store templateId for editor
                if (templateId) {
                  sessionStorage.setItem('editOffboardingTemplateId', templateId);
                } else {
                  sessionStorage.removeItem('editOffboardingTemplateId');
                }
              }}
            />
          )}

          {(currentPage === 'new-offboarding-template' || currentPage === 'edit-offboarding-template') && (
            <OffboardingTemplateEditor
              templateId={currentPage === 'edit-offboarding-template' ? sessionStorage.getItem('editOffboardingTemplateId') || undefined : undefined}
              organizationId={config?.organizationId || ''}
              onSave={() => {
                setCurrentPage('offboarding-templates');
                sessionStorage.removeItem('editOffboardingTemplateId');
              }}
              onCancel={() => {
                setCurrentPage('offboarding-templates');
                sessionStorage.removeItem('editOffboardingTemplateId');
              }}
            />
          )}

          {currentPage === 'scheduled-actions' && (
            <Suspense fallback={<PageLoader />}>
              <ScheduledActions organizationId={config?.organizationId || ''} />
            </Suspense>
          )}

          {currentPage === 'team-analytics' && (
            <Suspense fallback={<PageLoader />}>
              <TeamAnalytics />
            </Suspense>
          )}

          {currentPage === 'requests' && (
            <Suspense fallback={<PageLoader />}>
              <RequestsPage />
            </Suspense>
          )}

          {currentPage === 'tasks' && (
            <Suspense fallback={<PageLoader />}>
              <TasksDashboard />
            </Suspense>
          )}

          {currentPage === 'training' && (
            <Suspense fallback={<PageLoader />}>
              <TrainingContent />
            </Suspense>
          )}

          {currentPage === 'my-onboarding' && (
            <Suspense fallback={<PageLoader />}>
              <UserOnboardingPortal />
            </Suspense>
          )}

          {currentPage === 'hr-dashboard' && (
            <Suspense fallback={<PageLoader />}>
              <HRDashboard onNavigate={(page: string) => setCurrentPage(page)} />
            </Suspense>
          )}

          {currentPage === 'manager-dashboard' && (
            <Suspense fallback={<PageLoader />}>
              <ManagerDashboard onNavigate={(page: string) => setCurrentPage(page)} />
            </Suspense>
          )}

          {currentPage === 'lifecycle-analytics' && (
            <Suspense fallback={<PageLoader />}>
              <LifecycleAnalytics onNavigate={(page: string) => setCurrentPage(page)} />
            </Suspense>
          )}

          {currentPage === 'rules-engine' && (
            <Suspense fallback={<PageLoader />}>
              <RulesEngine />
            </Suspense>
          )}

          {currentPage === 'new-user-onboarding' && (
            <Suspense fallback={<PageLoader />}>
              <NewUserOnboarding
                organizationId={config?.organizationId || ''}
                onComplete={() => setCurrentPage('people')}
                onCancel={() => setCurrentPage('people')}
              />
            </Suspense>
          )}

          {currentPage === 'user-offboarding' && (
            <Suspense fallback={<PageLoader />}>
              <UserOffboarding
                organizationId={config?.organizationId || ''}
                onComplete={() => setCurrentPage('people')}
                onCancel={() => setCurrentPage('people')}
              />
            </Suspense>
          )}

          {currentPage !== 'dashboard' && currentPage !== 'settings' && currentPage !== 'users' && currentPage !== 'groups' && currentPage !== 'workspaces' && currentPage !== 'orgUnits' && currentPage !== 'assets' && currentPage !== 'files-assets' && currentPage !== 'email-security' && currentPage !== 'signatures' && currentPage !== 'security-events' && currentPage !== 'audit-logs' && currentPage !== 'licenses' && currentPage !== 'console' && currentPage !== 'administrators' && currentPage !== 'my-profile' && currentPage !== 'people' && currentPage !== 'my-team' && currentPage !== 'my-groups' && currentPage !== 'user-settings' && currentPage !== 'orgChart' && currentPage !== 'add-user' && currentPage !== 'onboarding-templates' && currentPage !== 'new-onboarding-template' && currentPage !== 'edit-onboarding-template' && currentPage !== 'offboarding-templates' && currentPage !== 'new-offboarding-template' && currentPage !== 'edit-offboarding-template' && currentPage !== 'scheduled-actions' && currentPage !== 'new-user-onboarding' && currentPage !== 'user-offboarding' && currentPage !== 'requests' && (
            <div className="page-placeholder">
              <div className="placeholder-content">
                <h2>Page Not Found</h2>
                <p>The page you're looking for doesn't exist or you don't have access.</p>
                <button
                  className="btn-primary"
                  onClick={() => setCurrentPage('dashboard')}
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* View Onboarding Modal for Internal Admins */}
      <ViewOnboarding onComplete={() => { }} />

      <footer className="client-footer">
        <p>Helios Admin Portal v1.0.0</p>
        <p>
          <a href="https://helios.gridworx.io/docs" target="_blank" rel="noopener noreferrer">
            📚 Documentation
          </a>
          {' • '}
          <a href="https://helios.gridworx.io/support" target="_blank" rel="noopener noreferrer">
            🆘 Support
          </a>
          {' • '}
          Powered by <a href="https://helios.gridworx.io" target="_blank" rel="noopener noreferrer">Helios</a>
        </p>
      </footer>

      {/* Command Bar (Cmd+K) */}
      <CommandBar
        isOpen={showCommandBar}
        onClose={() => setShowCommandBar(false)}
        onNavigate={(route) => navigate(route)}
        aiEnabled={aiEnabled}
      />

      {/* AI Chat Panel */}
      <ChatPanel
        isOpen={showChatPanel}
        onClose={() => {
          setShowChatPanel(false);
          setChatInitialMessage(undefined);
        }}
        aiEnabled={aiEnabled}
        onConfigure={() => {
          setShowChatPanel(false);
          navigate('/admin/settings');
        }}
        initialMessage={chatInitialMessage}
      />

      {/* Contextual Help Widget - triggered by ? icon in header */}
      {/* Help is independent of AI - shows knowledge base articles */}
      <HelpWidget
        currentPage={currentPage}
        externalOpen={showHelpWidget}
        onExternalClose={() => setShowHelpWidget(false)}
        hideFloatingButton={true}
        onAskAI={(question) => {
          setShowHelpWidget(false);
          setChatInitialMessage(question);
          setShowChatPanel(true);
        }}
      />
    </div>
  );
}

// Main App wrapper with providers
function App() {
  return (
    <BrowserRouter>
      <QueryProvider>
        <ToastProvider>
          <LabelsProvider>
            <FeatureFlagsProvider>
              <ViewProvider>
                <AppContent />
              </ViewProvider>
            </FeatureFlagsProvider>
          </LabelsProvider>
        </ToastProvider>
      </QueryProvider>
    </BrowserRouter>
  );
}

export default App;