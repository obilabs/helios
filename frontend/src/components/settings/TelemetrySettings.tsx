import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ToggleSwitch } from '@/components/ui';
import { authFetch } from '../../config/api';

interface TelemetryState {
  liveness: boolean;
  usage: boolean;
  envOverride: 'disabled' | 'usage_enabled' | null;
}

const LIVENESS_PAYLOAD = '{ "instance_id": "helios_…", "version": "…" }';

/**
 * Settings > Advanced > Telemetry. Mirrors backend/src/lib/telemetry-policy.ts:
 * anonymous liveness ping on by default, usage telemetry opt-in, and the
 * HELIOS_TELEMETRY_ENABLED environment variable overriding both.
 */
export function TelemetrySettings() {
  const [state, setState] = useState<TelemetryState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/v1/organization/telemetry');
        const body = await res.json();
        if (!cancelled) {
          if (res.ok && body.success) setState(body.data);
          else setError(body.error || 'Could not load telemetry settings');
        }
      } catch {
        if (!cancelled) setError('Could not load telemetry settings');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = async (patch: Partial<Pick<TelemetryState, 'liveness' | 'usage'>>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/organization/telemetry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (res.ok && body.success) setState(body.data);
      else setError(body.error || 'Could not save telemetry settings');
    } catch {
      setError('Could not save telemetry settings');
    } finally {
      setSaving(false);
    }
  };

  if (!state) {
    return error ? <p className="form-hint">{error}</p> : <p className="form-hint">Loading…</p>;
  }

  const locked = state.envOverride !== null;

  return (
    <div data-testid="settings-telemetry">
      {state.envOverride === 'disabled' && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          <span>
            <code>HELIOS_TELEMETRY_ENABLED=false</code> is set on the server: nothing is sent, including the
            liveness ping and licence checks.
          </span>
        </div>
      )}
      {state.envOverride === 'usage_enabled' && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          <span>
            <code>HELIOS_TELEMETRY_ENABLED=true</code> is set on the server, so usage telemetry is on and these
            settings cannot be changed here.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>Anonymous liveness ping</h4>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            On by default. Sent once after setup and then daily so running installs can be counted. It contains
            only a random install ID and the Helios version: <code>{LIVENESS_PAYLOAD}</code>
          </p>
        </div>
        <ToggleSwitch
          checked={state.liveness}
          onChange={(checked) => update({ liveness: checked })}
          disabled={locked || saving}
          ariaLabel="Anonymous liveness ping"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>Usage telemetry</h4>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Off by default. Adds a user count range, the enabled modules, uptime, the last sync outcome and counts
            of API calls, commands and UI actions by name.
          </p>
        </div>
        <ToggleSwitch
          checked={state.usage}
          onChange={(checked) => update({ usage: checked })}
          disabled={locked || saving}
          ariaLabel="Usage telemetry"
        />
      </div>

      <p className="form-hint" style={{ marginTop: 12 }}>
        Never sent: organization name or domain, user names, emails, IP addresses, credentials or directory data.
        Changes are recorded in the audit log.
      </p>
      {error && <p className="form-hint" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  );
}
