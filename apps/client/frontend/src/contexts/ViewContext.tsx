import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { authFetch, apiPath } from '../config/api';

/**
 * View modes available in the application
 */
export type ViewMode = 'admin' | 'user';

/**
 * User capabilities for determining available views
 */
export interface UserCapabilities {
  isAdmin: boolean;
  isEmployee: boolean;
}

/**
 * View Context value
 */
interface ViewContextValue {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  canAccessAdminView: boolean;
  canAccessUserView: boolean;
  canSwitchViews: boolean;
  capabilities: UserCapabilities;
  setCapabilities: (caps: UserCapabilities) => void;
  isLoading: boolean;
}

const defaultCapabilities: UserCapabilities = {
  isAdmin: false,
  isEmployee: false,
};

const ViewContext = createContext<ViewContextValue>({
  currentView: 'admin',
  setCurrentView: () => {},
  canAccessAdminView: false,
  canAccessUserView: false,
  canSwitchViews: false,
  capabilities: defaultCapabilities,
  setCapabilities: () => {},
  isLoading: false,
});

/**
 * Fetch view preference from API
 */
async function fetchViewPreference(): Promise<ViewMode | null> {
  try {
    const response = await authFetch(apiPath('/me/view-preference'));

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.data?.viewPreference) {
      return data.data.viewPreference as ViewMode;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch view preference:', error);
    return null;
  }
}

/**
 * Save view preference to API
 */
async function saveViewPreference(viewPreference: ViewMode, fromView?: ViewMode): Promise<boolean> {
  try {
    const response = await authFetch(apiPath('/me/view-preference'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ viewPreference, fromView }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to save view preference:', error);
    return false;
  }
}

/**
 * Determine default view based on user capabilities
 */
function getDefaultView(caps: UserCapabilities): ViewMode {
  // External admin - always admin
  if (caps.isAdmin && !caps.isEmployee) {
    return 'admin';
  }

  // Internal admin - default to admin, can switch
  if (caps.isAdmin && caps.isEmployee) {
    // Check for saved preference
    const savedView = localStorage.getItem('helios_view_preference');
    if (savedView === 'admin' || savedView === 'user') {
      return savedView;
    }
    return 'admin';
  }

  // Regular employee - always user
  if (caps.isEmployee) {
    return 'user';
  }

  // Fallback - admin view (should be unreachable for authenticated users)
  return 'admin';
}

/**
 * View Provider Component
 *
 * Manages the current view (admin vs user) and determines
 * which views are accessible based on user capabilities.
 */
export const ViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [capabilities, setCapabilitiesState] = useState<UserCapabilities>(defaultCapabilities);
  const [currentView, setCurrentViewState] = useState<ViewMode>('admin');
  const [isLoading, setIsLoading] = useState(false);
  const hasFetchedPreference = useRef(false);

  // Derived access flags
  const canAccessAdminView = capabilities.isAdmin;
  const canAccessUserView = capabilities.isEmployee;
  const canSwitchViews = capabilities.isAdmin && capabilities.isEmployee;

  /**
   * Set capabilities and load view preference from API or localStorage
   */
  const setCapabilities = useCallback(async (caps: UserCapabilities) => {
    setCapabilitiesState(caps);

    // External admin - always admin, no need to fetch
    if (caps.isAdmin && !caps.isEmployee) {
      setCurrentViewState('admin');
      return;
    }

    // Regular employee - always user, no need to fetch
    if (caps.isEmployee && !caps.isAdmin) {
      setCurrentViewState('user');
      return;
    }

    // Internal admin - try to fetch preference from API
    if (caps.isAdmin && caps.isEmployee && !hasFetchedPreference.current) {
      hasFetchedPreference.current = true;
      setIsLoading(true);

      const apiPreference = await fetchViewPreference();
      if (apiPreference) {
        setCurrentViewState(apiPreference);
        // Sync to localStorage for faster loading next time
        localStorage.setItem('helios_view_preference', apiPreference);
      } else {
        // Fall back to localStorage or default
        const localPreference = localStorage.getItem('helios_view_preference');
        if (localPreference === 'admin' || localPreference === 'user') {
          setCurrentViewState(localPreference);
        } else {
          setCurrentViewState('admin'); // Default to admin
        }
      }

      setIsLoading(false);
    } else {
      // Use localStorage for immediate loading
      const defaultView = getDefaultView(caps);
      setCurrentViewState(defaultView);
    }
  }, []);

  /**
   * Set current view with validation and persist to API
   */
  const setCurrentView = useCallback((view: ViewMode) => {
    // Validate the view change
    if (view === 'admin' && !canAccessAdminView) {
      console.warn('Cannot switch to admin view - not an admin');
      return;
    }
    if (view === 'user' && !canAccessUserView) {
      console.warn('Cannot switch to user view - not an employee');
      return;
    }

    // Capture previous view for audit logging
    const previousView = currentView;

    setCurrentViewState(view);

    // Persist preference for internal admins
    if (canSwitchViews) {
      // Save to localStorage immediately for fast access
      localStorage.setItem('helios_view_preference', view);

      // Also save to API for cross-device sync with fromView for audit logging
      saveViewPreference(view, previousView).catch(err => {
        console.error('Failed to save view preference to API:', err);
      });
    }
  }, [canAccessAdminView, canAccessUserView, canSwitchViews, currentView]);

  // Load capabilities from stored user data on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('helios_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        // Use access flags from stored user if available (from API)
        // Otherwise derive from role for backward compatibility
        const caps: UserCapabilities = {
          isAdmin: user.isAdmin ?? (user.role === 'admin' || user.role === 'super_admin'),
          isEmployee: user.isEmployee ?? true, // Default to true if not specified
        };
        setCapabilities(caps);
      } catch (err) {
        console.error('Failed to parse stored user:', err);
      }
    }
  }, [setCapabilities]);

  return (
    <ViewContext.Provider
      value={{
        currentView,
        setCurrentView,
        canAccessAdminView,
        canAccessUserView,
        canSwitchViews,
        capabilities,
        setCapabilities,
        isLoading,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
};

/**
 * Hook to access view context
 *
 * Usage:
 * ```tsx
 * const { currentView, setCurrentView, canSwitchViews } = useView();
 *
 * // Switch views (for internal admins)
 * if (canSwitchViews) {
 *   <ViewSwitcher value={currentView} onChange={setCurrentView} />
 * }
 * ```
 */
export const useView = () => {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within ViewProvider');
  }
  return context;
};

/**
 * Hook to check if current view is admin
 */
export const useIsAdminView = (): boolean => {
  const { currentView } = useView();
  return currentView === 'admin';
};

/**
 * Hook to check if current view is user
 */
export const useIsUserView = (): boolean => {
  const { currentView } = useView();
  return currentView === 'user';
};
