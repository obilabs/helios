import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ENTITIES, DEFAULT_LABELS } from '../config/entities';
import type { EntityName } from '../config/entities';
import { authFetch } from '../config/api';

/**
 * Label set (singular + plural)
 */
export interface LabelSet {
  singular: string;
  plural: string;
}

/**
 * Labels for all entities
 */
export interface Labels {
  [canonicalName: string]: LabelSet;
}

/**
 * Entity availability information
 */
export interface EntityAvailability {
  available: boolean;
  providedBy: string[];
}

/**
 * Labels with availability
 */
export interface LabelsWithAvailability {
  labels: Labels;
  availability: {
    [canonicalName: string]: EntityAvailability;
  };
}

/**
 * Labels Context value
 */
interface LabelsContextValue {
  labels: Labels;
  availability: { [canonicalName: string]: EntityAvailability };
  isLoading: boolean;
  error: string | null;
  refreshLabels: () => Promise<void>;
  isEntityAvailable: (entityName: EntityName) => boolean;
}

const LabelsContext = createContext<LabelsContextValue>({
  labels: DEFAULT_LABELS,
  availability: {},
  isLoading: true,
  error: null,
  refreshLabels: async () => {},
  isEntityAvailable: () => false,
});

/**
 * Labels Provider Component
 *
 * Fetches and caches custom labels for the organization.
 * Provides labels to all child components via React Context.
 */
export const LabelsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [availability, setAvailability] = useState<{ [key: string]: EntityAvailability }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch labels from API
   */
  const fetchLabels = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch('/api/v1/organization/labels/with-availability');

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated - use defaults
          setLabels(DEFAULT_LABELS);
          setIsLoading(false);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        setLabels(data.data.labels || DEFAULT_LABELS);
        setAvailability(data.data.availability || {});
      } else {
        setLabels(DEFAULT_LABELS);
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Failed to fetch labels:', err);
      setError(err.message);
      setLabels(DEFAULT_LABELS); // Fallback to defaults on error
      setIsLoading(false);
    }
  };

  /**
   * Check if an entity is available (based on enabled modules)
   */
  const isEntityAvailable = (entityName: EntityName): boolean => {
    // If still loading or no availability data, be optimistic
    // (show entity until proven unavailable - better UX than hiding then showing)
    if (isLoading || Object.keys(availability).length === 0) {
      // Core entities always available
      if (entityName === ENTITIES.USER || entityName === ENTITIES.POLICY_CONTAINER) {
        return true;
      }
      // For non-core entities, be optimistic during load
      // This prevents flickering - entities will hide once we know they're unavailable
      return true;
    }

    const avail = availability[entityName];
    if (!avail) {
      // If specific availability info missing, assume available
      // (defensive - shouldn't happen if API working correctly)
      return true;
    }
    const result = avail.available;
    return result;
  };

  /**
   * Refresh labels (call after updating in Settings)
   */
  const refreshLabels = async () => {
    await fetchLabels();
  };

  // Fetch labels on mount and when labels/user change
  useEffect(() => {
    fetchLabels();

    // Listen for storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'helios_user' || e.key === 'helios_labels_updated') {
        // User or labels changed, re-fetch
        fetchLabels();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <LabelsContext.Provider
      value={{
        labels,
        availability,
        isLoading,
        error,
        refreshLabels,
        isEntityAvailable,
      }}
    >
      {children}
    </LabelsContext.Provider>
  );
};

/**
 * Hook to access labels
 *
 * Usage:
 * ```tsx
 * const { labels, isEntityAvailable } = useLabels();
 *
 * // Display labels
 * <h1>{labels[ENTITIES.USER].plural}</h1>  // "Users" or "People"
 *
 * // Check availability
 * {isEntityAvailable(ENTITIES.WORKSPACE) && (
 *   <NavItem to="/workspaces">{labels[ENTITIES.WORKSPACE].plural}</NavItem>
 * )}
 * ```
 */
export const useLabels = () => {
  const context = useContext(LabelsContext);
  if (!context) {
    throw new Error('useLabels must be used within LabelsProvider');
  }
  return context;
};

/**
 * Helper hook to get a specific entity's labels
 *
 * Usage:
 * ```tsx
 * const userLabels = useEntityLabels(ENTITIES.USER);
 * <button>Add {userLabels.singular}</button>  // "Add User" or "Add Person"
 * ```
 */
export const useEntityLabels = (entityName: EntityName): LabelSet => {
  const { labels } = useLabels();
  return labels[entityName] || DEFAULT_LABELS[entityName];
};

/**
 * Helper hook to check if entity is available
 *
 * Usage:
 * ```tsx
 * const workspacesAvailable = useEntityAvailable(ENTITIES.WORKSPACE);
 * {workspacesAvailable && <WorkspacesSection />}
 * ```
 */
export const useEntityAvailable = (entityName: EntityName): boolean => {
  const { isEntityAvailable } = useLabels();
  return isEntityAvailable(entityName);
};
