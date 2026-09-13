import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { authFetch } from '../../config/api';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import './FeatureFlagsSettings.css';

/** Shape served by GET /organization/feature-flags/details. */
interface FeatureFlag {
  feature_key: string;
  name: string;
  description: string;
  category: string;
  maturity: 'stable' | 'preview' | 'experimental';
  is_enabled: boolean;
  is_available: boolean;
  is_required: boolean;
  is_overridden: boolean;
  default_enabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  directory: 'Directory',
  signatures: 'Signatures',
  lifecycle: 'Lifecycle & automation',
  security: 'Security',
  insights: 'Insights',
  assets: 'Assets',
  employee: 'Employee view',
  platform: 'Platform',
};

const CATEGORY_ORDER = ['directory', 'signatures', 'lifecycle', 'security', 'employee', 'platform', 'insights', 'assets'];

/**
 * Features this installation has switched on. Flags and their maturity are
 * defined in backend/src/config/feature-registry.ts; the server's profile
 * (HELIOS_FEATURE_PROFILE) decides the defaults. Core features are not listed
 * (always on). In a release, experimental features are unavailable and hidden.
 */
export function FeatureFlagsSettings() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [profile, setProfile] = useState<'release' | 'development' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const { refresh: refreshGlobalFlags } = useFeatureFlags();

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [detailsRes, profileRes] = await Promise.all([
        authFetch('/api/v1/organization/feature-flags/details'),
        authFetch('/api/v1/organization/feature-flags/profile'),
      ]);
      if (!detailsRes.ok) throw new Error('Failed to fetch feature flags');
      const details = await detailsRes.json();
      if (details.success && Array.isArray(details.data)) setFlags(details.data);
      if (profileRes.ok) {
        const p = await profileRes.json();
        if (p.success && p.data?.profile) setProfile(p.data.profile);
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

  const apply = async (featureKey: string, request: RequestInit) => {
    try {
      setUpdating(featureKey);
      setError(null);
      const response = await authFetch(`/api/v1/organization/feature-flags/${featureKey}`, request);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to update feature flag');
      }
      setFlags(prev => prev.map(f => (f.feature_key === featureKey ? data.data : f)));
      // Navigation and pages read the global context: refresh it so the change
      // shows up everywhere immediately.
      await refreshGlobalFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feature flag');
    } finally {
      setUpdating(null);
    }
  };

  const toggleFlag = (flag: FeatureFlag) =>
    apply(flag.feature_key, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !flag.is_enabled }),
    });

  const resetFlag = (flag: FeatureFlag) => apply(flag.feature_key, { method: 'DELETE' });

  const listed = flags.filter(f => !f.is_required && (f.is_available || profile === 'development'));
  const categories = [...new Set(listed.map(f => f.category))].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="feature-flags-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading features...</span>
      </div>
    );
  }

  return (
    <div className="feature-flags-settings" data-testid="feature-flags-settings">
      <div className="ff-header">
        <div className="ff-header-info">
          <p>
            {profile === 'development'
              ? 'Development profile: every feature is on, including preview and experimental work.'
              : 'Finished features are on. Preview features are off by default and can be turned on here.'}
          </p>
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
        {categories.map(category => (
          <div key={category} className="ff-category">
            <div className="ff-category-header">{CATEGORY_LABELS[category] || category}</div>
            <div className="ff-list">
              {listed.filter(f => f.category === category).map(flag => (
                <div key={flag.feature_key} className="ff-item" data-testid={`feature-flag-${flag.feature_key}`}>
                  <div className="ff-item-info">
                    <span className="ff-item-name">
                      {flag.name}
                      {flag.maturity !== 'stable' && (
                        <span className={`ff-maturity-badge ff-maturity-${flag.maturity}`}>
                          {flag.maturity === 'preview' ? 'Preview' : 'Experimental'}
                        </span>
                      )}
                    </span>
                    <span className="ff-item-desc">{flag.description}</span>
                  </div>
                  <div className="ff-item-toggle">
                    {flag.is_overridden && flag.is_enabled !== flag.default_enabled && (
                      <button
                        className="btn-icon"
                        onClick={() => resetFlag(flag)}
                        title="Reset to default"
                        disabled={updating === flag.feature_key}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <ToggleSwitch
                      checked={flag.is_enabled}
                      onChange={() => toggleFlag(flag)}
                      size="medium"
                      disabled={updating === flag.feature_key || !flag.is_available}
                    />
                    {updating === flag.feature_key && <Loader2 className="spin ff-updating" size={14} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
