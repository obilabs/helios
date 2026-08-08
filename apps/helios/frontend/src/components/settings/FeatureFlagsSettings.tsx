import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { authFetch } from '../../config/api';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import './FeatureFlagsSettings.css';

interface FeatureFlag {
  id: string;
  feature_key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  category: string;
}

interface GroupedFlags {
  [category: string]: FeatureFlag[];
}

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation & Menus',
  automation: 'Automation Features',
  signatures: 'Email Signatures',
  insights: 'Insights & Reports',
  integrations: 'Integrations',
  users: 'User Management',
  console: 'Developer Console',
  general: 'General',
};

const CATEGORY_ORDER = ['navigation', 'automation', 'assets', 'signatures', 'insights', 'integrations', 'users', 'console', 'general'];

// Define navigation hierarchy for clear display
const NAV_HIERARCHY: Record<string, string[]> = {
  'nav.section.journeys': ['nav.onboarding', 'nav.offboarding', 'nav.training', 'nav.requests', 'nav.tasks'],
  'nav.section.automation': ['nav.signatures', 'nav.scheduled_actions', 'nav.rules_engine'],
  'nav.section.insights': ['nav.hr_dashboard', 'nav.manager_dashboard', 'nav.lifecycle_analytics'],
  'nav.section.assets': ['nav.it_assets', 'nav.media_files'],
  'nav.section.security': ['nav.mail_search', 'nav.security_events', 'nav.oauth_apps', 'nav.audit_logs', 'nav.licenses', 'nav.external_sharing'],
};

export function FeatureFlagsSettings() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const { refresh: refreshGlobalFlags } = useFeatureFlags();

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch('/api/v1/organization/feature-flags/details');

      if (!response.ok) {
        throw new Error('Failed to fetch feature flags');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setFlags(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const toggleFlag = async (featureKey: string, currentValue: boolean) => {
    try {
      setUpdating(featureKey);
      setError(null);
      const response = await authFetch(`/api/v1/organization/feature-flags/${featureKey}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_enabled: !currentValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feature flag');
      }

      // Update local state
      setFlags(prev => prev.map(f =>
        f.feature_key === featureKey ? { ...f, is_enabled: !currentValue } : f
      ));

      // Refresh global context so navigation updates immediately
      await refreshGlobalFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feature flag');
    } finally {
      setUpdating(null);
    }
  };

  // Group flags by category
  const groupedFlags: GroupedFlags = flags.reduce((acc, flag) => {
    const category = flag.category || 'general';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(flag);
    return acc;
  }, {} as GroupedFlags);

  // Sort categories
  const sortedCategories = Object.keys(groupedFlags).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  if (loading) {
    return (
      <div className="feature-flags-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading feature flags...</span>
      </div>
    );
  }

  return (
    <div className="feature-flags-settings">
      <div className="ff-header">
        <div className="ff-header-info">
          <h3>Feature Flags</h3>
          <p>Enable or disable features and navigation items</p>
        </div>
        <button className="btn-icon" onClick={fetchFlags} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="ff-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="ff-categories">
        {sortedCategories.map(category => {
          // Special handling for navigation category - show hierarchy
          if (category === 'navigation') {
            const navFlags = groupedFlags[category];
            const sectionFlags = navFlags.filter(f => f.feature_key.startsWith('nav.section.'));

            return (
              <div key={category} className="ff-category">
                <div className="ff-category-header">
                  {CATEGORY_LABELS[category] || category}
                </div>
                <div className="ff-list ff-nav-hierarchy">
                  {sectionFlags.map(sectionFlag => {
                    const childKeys = NAV_HIERARCHY[sectionFlag.feature_key] || [];
                    const childFlags = navFlags.filter(f => childKeys.includes(f.feature_key));
                    const sectionName = sectionFlag.name.replace(' Section', '');

                    return (
                      <div key={sectionFlag.id} className="ff-nav-section">
                        {/* Section toggle */}
                        <div className={`ff-item ff-section-header ${!sectionFlag.is_enabled ? 'ff-disabled' : ''}`}>
                          <div className="ff-item-info">
                            <span className="ff-item-name">{sectionName}</span>
                            <span className="ff-item-desc">
                              {sectionFlag.is_enabled ? 'Section visible' : 'Entire section hidden'}
                            </span>
                          </div>
                          <div className="ff-item-toggle">
                            <ToggleSwitch
                              checked={sectionFlag.is_enabled}
                              onChange={() => toggleFlag(sectionFlag.feature_key, sectionFlag.is_enabled)}
                              size="medium"
                              disabled={updating === sectionFlag.feature_key}
                            />
                            {updating === sectionFlag.feature_key && (
                              <Loader2 className="spin ff-updating" size={14} />
                            )}
                          </div>
                        </div>

                        {/* Child items - indented */}
                        {childFlags.map(flag => (
                          <div
                            key={flag.id}
                            className={`ff-item ff-child-item ${!sectionFlag.is_enabled ? 'ff-parent-disabled' : ''}`}
                          >
                            <div className="ff-item-info">
                              <ChevronRight size={14} className="ff-indent-icon" />
                              <span className="ff-item-name">{flag.name}</span>
                            </div>
                            <div className="ff-item-toggle">
                              <ToggleSwitch
                                checked={flag.is_enabled}
                                onChange={() => toggleFlag(flag.feature_key, flag.is_enabled)}
                                size="medium"
                                disabled={updating === flag.feature_key || !sectionFlag.is_enabled}
                              />
                              {updating === flag.feature_key && (
                                <Loader2 className="spin ff-updating" size={14} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Default rendering for other categories
          return (
            <div key={category} className="ff-category">
              <div className="ff-category-header">
                {CATEGORY_LABELS[category] || category}
              </div>
              <div className="ff-list">
                {groupedFlags[category].map(flag => (
                  <div key={flag.id} className="ff-item">
                    <div className="ff-item-info">
                      <span className="ff-item-name">{flag.name}</span>
                      {flag.description && (
                        <span className="ff-item-desc">{flag.description}</span>
                      )}
                      <span className="ff-item-key">{flag.feature_key}</span>
                    </div>
                    <div className="ff-item-toggle">
                      <ToggleSwitch
                        checked={flag.is_enabled}
                        onChange={() => toggleFlag(flag.feature_key, flag.is_enabled)}
                        size="medium"
                        disabled={updating === flag.feature_key}
                      />
                      {updating === flag.feature_key && (
                        <Loader2 className="spin ff-updating" size={14} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ff-note">
        <AlertCircle size={14} />
        <span>Changes update navigation immediately. Disabling a section hides all items within it.</span>
      </div>
    </div>
  );
}
