import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { authFetch, apiPath } from '../config/api';

/**
 * Feature flags map - key is the feature_key, value is enabled status
 */
export type FeatureFlags = Record<string, boolean>;

/**
 * Feature Flags Context value
 */
interface FeatureFlagsContextValue {
  /** Map of all feature flags */
  flags: FeatureFlags;
  /** Check if a specific feature is enabled */
  isEnabled: (featureKey: string) => boolean;
  /** Check if multiple features are all enabled */
  allEnabled: (...featureKeys: string[]) => boolean;
  /** Check if at least one of the features is enabled */
  anyEnabled: (...featureKeys: string[]) => boolean;
  /** Refresh flags from the server */
  refresh: () => Promise<void>;
  /** Whether flags are currently loading */
  isLoading: boolean;
  /** Any error that occurred while loading */
  error: string | null;
}

const defaultValue: FeatureFlagsContextValue = {
  flags: {},
  isEnabled: () => false,
  allEnabled: () => false,
  anyEnabled: () => false,
  refresh: async () => {},
  isLoading: true,
  error: null,
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>(defaultValue);

/**
 * Fetch feature flags from the API
 * Returns empty flags if not authenticated (401) - this is expected on initial load
 */
async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const response = await authFetch(apiPath('/organization/feature-flags'));

    // 401 is expected when not logged in - return empty flags silently
    if (response.status === 401 || response.status === 403) {
      return {};
    }

    if (!response.ok) {
      console.warn(`Feature flags fetch failed: ${response.status}`);
      return {};
    }

    const data = await response.json();
    if (data.success && data.data) {
      return data.data;
    }

    return {};
  } catch (err) {
    // Network errors or other issues - return empty flags
    console.warn('Feature flags fetch error:', err);
    return {};
  }
}

interface FeatureFlagsProviderProps {
  children: ReactNode;
}

/**
 * Feature Flags Provider
 *
 * Wraps the application to provide feature flags context.
 * Automatically fetches flags on mount when a user is authenticated.
 *
 * @example
 * // In App.tsx or main wrapper
 * <FeatureFlagsProvider>
 *   <App />
 * </FeatureFlagsProvider>
 *
 * // In a component
 * const { isEnabled } = useFeatureFlags();
 * if (isEnabled('automation.workflows')) {
 *   // render workflows UI
 * }
 */
export function FeatureFlagsProvider({ children }: FeatureFlagsProviderProps): ReactElement {
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    try {
      setError(null);
      const loadedFlags = await fetchFeatureFlags();
      setFlags(loadedFlags);
      // Only clear error, don't set it - fetchFeatureFlags handles errors gracefully
    } catch (err) {
      // This shouldn't happen since fetchFeatureFlags catches its own errors
      console.warn('Unexpected feature flags error:', err);
      // Don't set error state - just use empty flags
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load flags on mount
  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // Listen for auth changes (login/logout)
  // Note: With session auth, we rely on parent components to reload on auth changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'helios_user') {
        if (e.newValue) {
          // User logged in - reload flags
          loadFlags();
        } else {
          // User logged out - clear flags
          setFlags({});
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadFlags]);

  /**
   * Check if a feature is enabled
   */
  const isEnabled = useCallback((featureKey: string): boolean => {
    return flags[featureKey] === true;
  }, [flags]);

  /**
   * Check if all features are enabled
   */
  const allEnabled = useCallback((...featureKeys: string[]): boolean => {
    return featureKeys.every(key => flags[key] === true);
  }, [flags]);

  /**
   * Check if any feature is enabled
   */
  const anyEnabled = useCallback((...featureKeys: string[]): boolean => {
    return featureKeys.some(key => flags[key] === true);
  }, [flags]);

  /**
   * Refresh flags from server
   */
  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await loadFlags();
  }, [loadFlags]);

  const value: FeatureFlagsContextValue = {
    flags,
    isEnabled,
    allEnabled,
    anyEnabled,
    refresh,
    isLoading,
    error,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Hook to access feature flags
 *
 * @example
 * const { isEnabled, anyEnabled } = useFeatureFlags();
 *
 * // Single feature check
 * if (isEnabled('automation.workflows')) { ... }
 *
 * // Multiple features - all must be enabled
 * if (isEnabled('signatures.templates') && isEnabled('signatures.campaigns')) { ... }
 *
 * // Any of multiple features
 * if (anyEnabled('nav.workflows', 'nav.reports')) { ... }
 */
export function useFeatureFlags(): FeatureFlagsContextValue {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}

/**
 * Component that conditionally renders children based on feature flag
 *
 * @example
 * <FeatureGate feature="automation.workflows">
 *   <WorkflowsPage />
 * </FeatureGate>
 *
 * // With fallback
 * <FeatureGate feature="insights.reports" fallback={<ComingSoon />}>
 *   <ReportsPage />
 * </FeatureGate>
 */
interface FeatureGateProps {
  /** Feature key to check */
  feature: string;
  /** Content to render if feature is enabled */
  children: ReactNode;
  /** Optional content to render if feature is disabled */
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps): ReactElement | null {
  const { isEnabled, isLoading } = useFeatureFlags();

  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  return isEnabled(feature) ? <>{children}</> : <>{fallback}</>;
}

/**
 * Component that conditionally renders children based on multiple feature flags
 *
 * @example
 * // Render if ALL features are enabled
 * <MultiFeatureGate features={['signatures.templates', 'signatures.campaigns']} mode="all">
 *   <SignaturesPage />
 * </MultiFeatureGate>
 *
 * // Render if ANY feature is enabled
 * <MultiFeatureGate features={['nav.workflows', 'nav.reports']} mode="any">
 *   <InsightsSection />
 * </MultiFeatureGate>
 */
interface MultiFeatureGateProps {
  /** Feature keys to check */
  features: string[];
  /** How to combine features: 'all' = AND, 'any' = OR */
  mode: 'all' | 'any';
  /** Content to render if condition is met */
  children: ReactNode;
  /** Optional content to render if condition is not met */
  fallback?: ReactNode;
}

export function MultiFeatureGate({
  features,
  mode,
  children,
  fallback = null
}: MultiFeatureGateProps): ReactElement | null {
  const { allEnabled, anyEnabled, isLoading } = useFeatureFlags();

  if (isLoading) {
    return null;
  }

  const isActive = mode === 'all'
    ? allEnabled(...features)
    : anyEnabled(...features);

  return isActive ? <>{children}</> : <>{fallback}</>;
}

export default FeatureFlagsContext;
