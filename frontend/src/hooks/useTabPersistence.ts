import { useState, useEffect } from 'react';

/**
 * Custom hook for persisting tab state across page refreshes
 *
 * @param storageKey - Unique localStorage key for this page's tabs (e.g., 'helios_settings_tab')
 * @param defaultTab - The default tab to show if no saved state exists
 * @returns [activeTab, setActiveTab] - Tuple with current tab and setter function
 *
 * @example
 * ```tsx
 * const [activeTab, setActiveTab] = useTabPersistence('helios_settings_tab', 'modules');
 * ```
 */
export function useTabPersistence<T extends string>(
  storageKey: string,
  defaultTab: T
): [T, (tab: T) => void] {
  // Initialize state from localStorage or use default
  const [activeTab, setActiveTab] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return (saved as T) || defaultTab;
    } catch (error) {
      console.warn(`Failed to load tab state from localStorage (${storageKey}):`, error);
      return defaultTab;
    }
  });

  // Save to localStorage whenever tab changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, activeTab);
    } catch (error) {
      console.warn(`Failed to save tab state to localStorage (${storageKey}):`, error);
    }
  }, [activeTab, storageKey]);

  return [activeTab, setActiveTab];
}
