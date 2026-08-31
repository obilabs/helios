import { useEffect, useState } from 'react';
import { RefreshCw, UserPlus, X, Mail, AlertTriangle } from 'lucide-react';
import { authFetch, apiPath } from '../config/api';
import './Delegations.css';

/**
 * Org-wide Gmail delegation overview: which mailboxes have delegates (who can
 * read + send as whom) across the workspace, with inline add/remove. Delegation
 * grants mailbox access WITHOUT sharing the password — the safe way to let
 * someone cover an inbox (e.g. read a migrated user's mail).
 */
interface Delegate { email: string; verificationStatus: string; }
interface MailboxDelegation { mailbox: string; delegates: Delegate[]; }

export default function Delegations() {
  const [rows, setRows] = useState<MailboxDelegation[]>([]);
  const [checked, setChecked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(apiPath('/organization/delegations'));
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Failed to load delegations');
      setRows(json.data.delegations || []);
      setChecked(json.data.mailboxesChecked || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!mailbox.trim() || !delegateEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(apiPath('/organization/delegations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailbox: mailbox.trim(), delegateEmail: delegateEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add delegate');
      setMailbox('');
      setDelegateEmail('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (mb: string, del: string) => {
    if (!window.confirm(`Remove ${del} as a delegate on ${mb}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(apiPath('/organization/delegations'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailbox: mb, delegateEmail: del }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to remove delegate');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="delegations-page">
      <div className="page-header">
        <div>
          <h1>Email Delegations</h1>
          <p className="page-subtitle">Gmail mailboxes with delegated access across the workspace — who can read and send as whom. Delegation grants mailbox access without sharing the password.</p>
        </div>
        <button className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="deleg-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="deleg-add">
        <input className="deleg-input" placeholder="Mailbox (e.g. todd@tmscanada.ca)" value={mailbox} onChange={(e) => setMailbox(e.target.value)} />
        <input className="deleg-input" placeholder="Delegate email (who gets access)" value={delegateEmail} onChange={(e) => setDelegateEmail(e.target.value)} />
        <button className="btn-primary" onClick={add} disabled={busy || !mailbox.trim() || !delegateEmail.trim()}>
          <UserPlus size={16} /> Add delegate
        </button>
      </div>

      {loading ? (
        <div className="deleg-loading">Checking mailboxes…</div>
      ) : rows.length === 0 ? (
        <div className="deleg-empty"><Mail size={20} /> No mailboxes have delegates{checked ? ` (checked ${checked})` : ''}. Add one above.</div>
      ) : (
        <div className="deleg-list">
          <div className="deleg-count">{rows.length} mailbox{rows.length === 1 ? '' : 'es'} with delegates, of {checked} checked</div>
          {rows.map((r) => (
            <div className="deleg-row" key={r.mailbox}>
              <div className="deleg-mailbox">{r.mailbox}</div>
              <div className="deleg-chips">
                {r.delegates.map((d) => (
                  <span className="deleg-chip" key={d.email}>
                    {d.email}
                    <span className={`deleg-status ${d.verificationStatus === 'accepted' ? 'ok' : ''}`}>{d.verificationStatus}</span>
                    <button className="deleg-remove" title="Remove delegate" onClick={() => remove(r.mailbox, d.email)} disabled={busy}><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
