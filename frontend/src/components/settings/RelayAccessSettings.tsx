import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, Trash2, Plus, ShieldCheck, Loader2 } from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { authFetch } from '../../config/api';
import './RelayAccessSettings.css';

/**
 * API Relay Access — admin surface for the least-privilege gate on the
 * transparent Google API proxy. Deny-by-default: with the gate on, only the
 * allow rules an admin authors here can pass, each minted the minimal OAuth
 * scope its resource+method needs.
 *
 * Two gates must both be on for enforcement to bite:
 *   - the global `api_relay` feature flag (master enforcement switch), and
 *   - the per-org relay toggle.
 * Writes/deletes need a third, separate toggle.
 */

interface RelayConfig {
  relay_enabled: boolean;
  writes_enabled: boolean;
  feature_flag_enabled: boolean;
  enforcement_active: boolean;
}

interface RelayRule {
  id: string;
  effect: 'allow' | 'deny';
  matchPattern: string;
  subjectAllowPrivileged: boolean;
  subjectOrgUnits: string[] | null;
  expiresAt: string | null;
  createdAt: string | null;
}

// Resources with a minimal-scope mapping in the backend (services/relay/scopes.ts).
// A rule on a resource with no mapping is denied at forward time (no broad scopes).
const RESOURCE_PRESETS = [
  'admin.directory.users',
  'admin.directory.groups',
  'admin.directory.orgunits',
  'admin.directory.domains',
];
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', '*'];

export function RelayAccessSettings() {
  const [config, setConfig] = useState<RelayConfig | null>(null);
  const [rules, setRules] = useState<RelayRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingToggle, setSavingToggle] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add-rule form state.
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [resource, setResource] = useState<string>(RESOURCE_PRESETS[0]);
  const [customResource, setCustomResource] = useState('');
  const [method, setMethod] = useState<string>('GET');
  const [allowPrivileged, setAllowPrivileged] = useState(false);
  const [orgUnits, setOrgUnits] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cfgRes, rulesRes] = await Promise.all([
        authFetch('/api/v1/organization/relay/config'),
        authFetch('/api/v1/organization/relay/rules'),
      ]);
      if (!cfgRes.ok) throw new Error('Failed to load relay config');
      if (!rulesRes.ok) throw new Error('Failed to load relay rules');
      const cfg = await cfgRes.json();
      const rl = await rulesRes.json();
      setConfig(cfg.data);
      setRules(rl.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load relay settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchConfig = async (field: keyof RelayConfig, value: boolean) => {
    try {
      setSavingToggle(field);
      setError(null);
      const body: Record<string, boolean> = {};
      if (field === 'feature_flag_enabled') body.feature_flag_enabled = value;
      if (field === 'relay_enabled') body.relay_enabled = value;
      if (field === 'writes_enabled') body.writes_enabled = value;
      const res = await authFetch('/api/v1/organization/relay/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update relay config');
      const data = await res.json();
      setConfig(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update relay config');
    } finally {
      setSavingToggle(null);
    }
  };

  const addRule = async () => {
    try {
      setAdding(true);
      setError(null);
      const res = resource === '__custom__' ? customResource.trim() : resource;
      const matchPattern = `${res}:${method}`;
      const ous = orgUnits
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        effect,
        match_pattern: matchPattern,
        subject_allow_privileged: allowPrivileged,
      };
      if (ous.length > 0) payload.subject_org_units = ous;
      if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();

      const response = await authFetch('/api/v1/organization/relay/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const msg =
          data?.error?.details?.[0]?.message || data?.error?.message || 'Failed to add rule';
        throw new Error(msg);
      }
      const created = await response.json();
      setRules((prev) => [created.data, ...prev]);
      // Reset optional fields but keep effect/resource/method for quick repeats.
      setAllowPrivileged(false);
      setOrgUnits('');
      setExpiresAt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setAdding(false);
    }
  };

  const removeRule = async (id: string) => {
    try {
      setDeletingId(id);
      setError(null);
      const res = await authFetch(`/api/v1/organization/relay/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete rule');
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="relay-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading API relay settings...</span>
      </div>
    );
  }

  return (
    <div className="relay-settings">
      <div className="relay-header">
        <div className="relay-header-info">
          <h3>
            <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            API Relay Access (Least-Privilege Gate)
          </h3>
          <p>
            Deny-by-default authorization for the Google API proxy. Only the allow rules below can
            pass, each minted the minimal OAuth scope it needs.
          </p>
        </div>
        <button className="btn-icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && (
        <div className="relay-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {config && (
        <>
          <div className="relay-toggles">
            <div className="relay-toggle-row">
              <div className="relay-toggle-info">
                <span className="relay-toggle-name">Enforcement (global flag)</span>
                <span className="relay-toggle-desc">
                  Master switch (<code>api_relay</code>). Off = proxy passes every request through
                  unchanged (no enforcement).
                </span>
              </div>
              <ToggleSwitch
                checked={config.feature_flag_enabled}
                onChange={() => patchConfig('feature_flag_enabled', !config.feature_flag_enabled)}
                size="medium"
                disabled={savingToggle === 'feature_flag_enabled'}
              />
            </div>

            <div className="relay-toggle-row">
              <div className="relay-toggle-info">
                <span className="relay-toggle-name">Relay enabled</span>
                <span className="relay-toggle-desc">
                  Per-organization opt-in. With the flag on but this off, everything is denied
                  (fail-closed).
                </span>
              </div>
              <ToggleSwitch
                checked={config.relay_enabled}
                onChange={() => patchConfig('relay_enabled', !config.relay_enabled)}
                size="medium"
                disabled={savingToggle === 'relay_enabled'}
              />
            </div>

            <div className="relay-toggle-row">
              <div className="relay-toggle-info">
                <span className="relay-toggle-name">Allow writes &amp; deletes</span>
                <span className="relay-toggle-desc">
                  Separate gate. Enabling the relay never enables writes; deletes still need an
                  explicit <code>:DELETE</code> rule.
                </span>
              </div>
              <ToggleSwitch
                checked={config.writes_enabled}
                onChange={() => patchConfig('writes_enabled', !config.writes_enabled)}
                size="medium"
                disabled={savingToggle === 'writes_enabled'}
              />
            </div>
          </div>

          <div className={`relay-status ${config.enforcement_active ? 'active' : 'inactive'}`}>
            {config.enforcement_active
              ? 'Enforcement is ACTIVE — the relay is applying deny-by-default with minimal scopes.'
              : 'Enforcement is INACTIVE — turn on both the global flag and the relay toggle to enforce.'}
          </div>
        </>
      )}

      <div className="relay-rules">
        <h4>Rules</h4>
        {rules.length === 0 ? (
          <div className="relay-empty">
            No rules yet. With enforcement active and no allow rules, every request is denied.
          </div>
        ) : (
          <table className="relay-rules-table">
            <thead>
              <tr>
                <th>Effect</th>
                <th>Pattern</th>
                <th>Subject</th>
                <th>Expires</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <span className={`relay-effect relay-effect-${rule.effect}`}>{rule.effect}</span>
                  </td>
                  <td>
                    <code>{rule.matchPattern}</code>
                  </td>
                  <td className="relay-subject-cell">
                    {rule.subjectAllowPrivileged && (
                      <span className="relay-tag">privileged OK</span>
                    )}
                    {rule.subjectOrgUnits && rule.subjectOrgUnits.length > 0 && (
                      <span className="relay-tag">OU: {rule.subjectOrgUnits.join(', ')}</span>
                    )}
                    {!rule.subjectAllowPrivileged &&
                      (!rule.subjectOrgUnits || rule.subjectOrgUnits.length === 0) && (
                        <span className="relay-muted">—</span>
                      )}
                  </td>
                  <td>
                    {rule.expiresAt ? (
                      new Date(rule.expiresAt).toLocaleString()
                    ) : (
                      <span className="relay-muted">never</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-icon relay-delete"
                      title="Delete rule"
                      disabled={deletingId === rule.id}
                      onClick={() => removeRule(rule.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="relay-add">
        <h4>Add rule</h4>
        <div className="relay-add-form">
          <label>
            <span>Effect</span>
            <select value={effect} onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}>
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </label>

          <label>
            <span>Resource</span>
            <select value={resource} onChange={(e) => setResource(e.target.value)}>
              {RESOURCE_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
          </label>

          {resource === '__custom__' && (
            <label>
              <span>Custom resource</span>
              <input
                type="text"
                placeholder="admin.directory.users"
                value={customResource}
                onChange={(e) => setCustomResource(e.target.value)}
              />
            </label>
          )}

          <label>
            <span>Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="relay-checkbox">
            <input
              type="checkbox"
              checked={allowPrivileged}
              onChange={(e) => setAllowPrivileged(e.target.checked)}
            />
            <span>Allow privileged subjects</span>
          </label>

          <label>
            <span>OU scope (comma-separated, optional)</span>
            <input
              type="text"
              placeholder="/Sales, /Engineering"
              value={orgUnits}
              onChange={(e) => setOrgUnits(e.target.value)}
            />
          </label>

          <label>
            <span>Expires (optional)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>

          <button className="btn-primary relay-add-btn" onClick={addRule} disabled={adding}>
            {adding ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
            <span>Add rule</span>
          </button>
        </div>
        <p className="relay-hint">
          Pattern is <code>resource:METHOD</code> (built from the fields above). Deny rules are
          org-wide and beat any allow. Resources without a scope mapping are denied at forward time
          rather than minted broad scopes.
        </p>
      </div>
    </div>
  );
}
