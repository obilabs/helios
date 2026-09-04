import { useEffect, useState } from 'react';
import { authFetch } from '../config/api';

/**
 * Per-platform "available licenses" configuration. The dashboard uses these to
 * warn as you approach the limit and to flag accounts left without a license.
 * Blank means: use the provider-reported total (Microsoft) or don't track
 * (Google, whose seat cap is not reliably exposed via API). Display-only —
 * Helios never enforces a hard cap.
 */
export function LicenseLimitsSection() {
  const [google, setGoogle] = useState('');
  const [microsoft, setMicrosoft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/v1/organization/license-limits');
        const json = await res.json();
        if (json.success && json.data) {
          setGoogle(json.data.google != null ? String(json.data.google) : '');
          setMicrosoft(json.data.microsoft != null ? String(json.data.microsoft) : '');
        }
      } catch {
        /* leave blank on load failure */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await authFetch('/api/v1/organization/license-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google: google.trim() === '' ? null : Number(google),
          microsoft: microsoft.trim() === '' ? null : Number(microsoft),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save license limits');
      setGoogle(json.data.google != null ? String(json.data.google) : '');
      setMicrosoft(json.data.microsoft != null ? String(json.data.microsoft) : '');
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>License Limits</h2>
        <p>
          Set how many licenses (seats) are available per platform. The dashboard warns as you
          approach the limit and flags accounts left without a license — users without one often
          have degraded mail or drive access.
        </p>
      </div>
      <div className="settings-form">
        <div className="form-group">
          <label>Google Workspace — available licenses</label>
          <input
            type="number"
            min={0}
            className="form-input"
            value={google}
            onChange={(e) => { setGoogle(e.target.value); setSaved(false); }}
            placeholder="e.g. 10"
            disabled={loading}
          />
          <div className="form-hint">
            Google does not reliably expose a seat cap via API — enter your subscription's seat count
            so the dashboard can track usage. Leave blank to skip tracking.
          </div>
        </div>
        <div className="form-group">
          <label>Microsoft 365 — available licenses</label>
          <input
            type="number"
            min={0}
            className="form-input"
            value={microsoft}
            onChange={(e) => { setMicrosoft(e.target.value); setSaved(false); }}
            placeholder="Auto (from Microsoft)"
            disabled={loading}
          />
          <div className="form-hint">
            Leave blank to use the seat count Microsoft reports. Enter a value to override it.
          </div>
        </div>
        {error && <div className="form-hint" style={{ color: '#b91c1c' }}>{error}</div>}
        <div>
          <button className="btn-primary" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save license limits'}
          </button>
        </div>
      </div>
    </div>
  );
}
