import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { authFetch } from '../config/api';
import './FieldDriftPanel.css';

interface Drift {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  field: string;
  heliosValue: string | null;
  platformValue: string | null;
  owner: 'google' | 'helios';
}

const LABELS: Record<string, string> = {
  jobTitle: 'Job title',
  department: 'Department',
  manager: 'Manager',
  mobilePhone: 'Mobile phone',
  workPhone: 'Work phone',
  location: 'Location',
};

/**
 * Profile fields that differ between Helios and Google and that the sync did not
 * resolve on its own (the field is owned by Helios, or Google's value was empty and
 * would have wiped a filled Helios value). Before field ownership these differences
 * were invisible, and the next save in Helios silently overwrote Google.
 */
export function FieldDriftPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Drift[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await authFetch('/api/v1/organization/field-drift');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setItems(data.data || []);
    } catch {
      // Leave the banner hidden rather than show a count we could not read.
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string, keep: 'helios' | 'google') => {
    setBusy(id + keep);
    setError(null);
    try {
      const res = await authFetch(`/api/v1/organization/field-drift/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) setError(data.error || `Could not resolve (${res.status})`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin || items.length === 0) return null;

  return (
    <>
      <button type="button" className="field-drift-banner" onClick={() => setOpen(true)}>
        <AlertTriangle size={15} />
        <span>
          {items.length} profile {items.length === 1 ? 'field differs' : 'fields differ'} between Helios and Google.
        </span>
        <span className="field-drift-review">Review</span>
      </button>

      {open && (
        <div className="field-drift-overlay" role="dialog" aria-label="Profile field differences" onClick={() => setOpen(false)}>
          <div className="field-drift-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="field-drift-head">
              <h3>Helios and Google disagree</h3>
              <button type="button" className="field-drift-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="field-drift-intro">
              Keep Google copies Google&apos;s value into Helios. Keep Helios sends Helios&apos;s value to Google and changes
              nothing else. Who owns each field by default is set in Settings, Advanced.
            </p>
            {error && <p className="field-drift-error">{error}</p>}
            <table className="field-drift-table">
              <thead>
                <tr><th>Person</th><th>Field</th><th>Helios</th><th>Google</th><th /></tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div>{[d.firstName, d.lastName].filter(Boolean).join(' ') || d.email}</div>
                      <div className="field-drift-sub">{d.email}</div>
                    </td>
                    <td>
                      {LABELS[d.field] ?? d.field}
                      <div className="field-drift-sub">owned by {d.owner === 'google' ? 'Google' : 'Helios'}</div>
                    </td>
                    <td>{d.heliosValue || <span className="field-drift-empty">empty</span>}</td>
                    <td>{d.platformValue || <span className="field-drift-empty">empty</span>}</td>
                    <td className="field-drift-actions">
                      <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => resolve(d.id, 'helios')}>
                        {busy === d.id + 'helios' ? 'Sending…' : 'Keep Helios'}
                      </button>
                      <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => resolve(d.id, 'google')}>
                        {busy === d.id + 'google' ? 'Saving…' : 'Keep Google'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
