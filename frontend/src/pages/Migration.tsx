import { useEffect, useState } from 'react';
import { RefreshCw, Download, PlayCircle, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { authFetch, apiPath } from '../config/api';
import './Migration.css';

/**
 * Microsoft 365 -> Google Workspace migration workspace.
 *
 * Helios ORCHESTRATES; Google's native Data Migration does the transfer. This page
 * covers Helios's part: review the source->destination plan, provision the Google
 * destinations, download the mapping CSV for Google's importer, deep-link into the
 * Google console for the transfer itself, and track progress from the read-only
 * data_migration audit stream.
 */

interface MigrationTarget {
  sourceMs365Id: string;
  sourceUpn: string | null;
  sourceEmail: string;
  sourceName: string;
  targetGoogleEmail: string | null;
  targetExists: boolean;
  transfer: { mail: boolean; drive: boolean; calendar: boolean; contacts: boolean };
  destinationType: 'mailbox' | 'group' | 'delegated';
  status: 'unmapped' | 'ready';
}
interface MigrationPlan {
  organizationId: string;
  generatedAt: string;
  targets: MigrationTarget[];
}
interface PlanValidation {
  ok: boolean;
  unmapped: string[];
  missingDestination: string[];
  readyCount: number;
}
interface ProvisionResult {
  execute: boolean;
  created: number;
  wouldCreate: number;
  results: Array<{ source: string; target?: string; action: string; error?: string }>;
}
interface MigrationFailure {
  timestamp?: string;
  executionId?: string;
  user?: string;
  source?: string;
  target?: string;
  reason?: string;
}
interface MigrationUserProgress {
  user: string;
  executionId: string | null;
  total: number;
  failures: number;
  byName: Record<string, number>;
  firstActivity?: string;
  lastActivity?: string;
}
interface MigrationStatus {
  summary?: { total: number; failures: number; byName: Record<string, number>; windowStart: string; windowEnd: string; pagesFetched?: number; truncated?: boolean };
  events?: Array<{ timestamp: string; name: string; target?: string; status?: string }>;
  failures?: MigrationFailure[];
  byUser?: MigrationUserProgress[];
}

// Friendly labels for the data_migration event names Google emits per object.
const EVENT_LABELS: Record<string, string> = {
  CREATE_GMAIL_MESSAGE: 'Mail',
  CREATE_CALENDAR_EVENT: 'Calendar',
  CREATE_CONTACT: 'Contacts',
  CREATE_FILE: 'Drive',
  CREATE_TASK: 'Tasks',
};

// Compact per-object-type summary for one target, e.g. "Mail 1,203 · Calendar 45".
const dataSummary = (byName: Record<string, number>): string => {
  const parts = Object.entries(byName)
    .filter(([name]) => EVENT_LABELS[name])
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${EVENT_LABELS[name]} ${n.toLocaleString()}`);
  return parts.join(' · ') || '—';
};

const CONSOLE_LINKS = [
  { label: 'Google Data Migration', url: 'https://admin.google.com/ac/dm' },
  { label: 'Google Users', url: 'https://admin.google.com/ac/users' },
  { label: 'Manage Domains', url: 'https://admin.google.com/ac/domains/manage' },
];

export default function Migration() {
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [validation, setValidation] = useState<PlanValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [status, setStatus] = useState<MigrationStatus | null>(null);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(apiPath('/microsoft/migration/plan'));
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Failed to load migration plan');
      setPlan(json.data.plan);
      setValidation(json.data.validation);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const res = await authFetch(apiPath('/microsoft/migration/status'));
      const json = await res.json();
      if (res.ok && json.success) setStatus(json.data);
    } catch {
      /* status is best-effort */
    }
  };

  useEffect(() => {
    loadPlan();
    loadStatus();
  }, []);

  const provision = async (execute: boolean) => {
    if (execute && !window.confirm('This creates real Google accounts and consumes licenses for each mapped destination. Continue?')) {
      return;
    }
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const res = await authFetch(apiPath(`/microsoft/migration/provision${execute ? '?execute=true' : ''}`), { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Provisioning failed');
      setProvisionResult(json.data);
      if (execute) loadPlan(); // refresh: destinations now exist
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProvisioning(false);
    }
  };

  const downloadCsv = async () => {
    try {
      const res = await authFetch(apiPath('/microsoft/migration/plan/csv'));
      if (!res.ok) throw new Error('Failed to download CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'm365-google-migration-mapping.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const targets = plan?.targets || [];
  const mapped = targets.filter((t) => t.targetGoogleEmail);
  const badge = (t: MigrationTarget) => {
    if (t.status === 'ready' && t.targetExists) return <span className="mig-badge ready">ready</span>;
    if (t.targetGoogleEmail && !t.targetExists) return <span className="mig-badge pending">needs provisioning</span>;
    return <span className="mig-badge unmapped">unmapped</span>;
  };

  return (
    <div className="migration-page">
      <div className="page-header">
        <div>
          <h1>Migration</h1>
          <p className="page-subtitle">Microsoft 365 → Google Workspace. Helios provisions the destinations and builds the mapping; Google's native Data Migration performs the transfer.</p>
        </div>
        <button className="btn-secondary" onClick={() => { loadPlan(); loadStatus(); }} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mig-error"><AlertTriangle size={16} /> {error}</div>
      )}

      {/* Validation summary */}
      {validation && (
        <div className="mig-summary">
          <div className="mig-card"><div className="mig-card-num">{targets.length}</div><div className="mig-card-label">Sources</div></div>
          <div className="mig-card"><div className="mig-card-num">{validation.readyCount}</div><div className="mig-card-label">Ready</div></div>
          <div className="mig-card"><div className="mig-card-num">{validation.missingDestination.length}</div><div className="mig-card-label">Need provisioning</div></div>
          <div className="mig-card"><div className="mig-card-num">{validation.unmapped.length}</div><div className="mig-card-label">Unmapped</div></div>
        </div>
      )}

      {/* Actions */}
      <div className="mig-actions">
        <button className="btn-secondary" onClick={() => provision(false)} disabled={provisioning || mapped.length === 0}>
          <PlayCircle size={16} /> Preview provisioning (dry-run)
        </button>
        <button className="btn-primary" onClick={() => provision(true)} disabled={provisioning || mapped.length === 0}>
          <PlayCircle size={16} /> Provision destinations
        </button>
        <button className="btn-secondary" onClick={downloadCsv} disabled={!validation || validation.readyCount === 0}>
          <Download size={16} /> Download import CSV
        </button>
      </div>

      {/* Provision results */}
      {provisionResult && (
        <div className="mig-provision-result">
          <strong>{provisionResult.execute ? `Created ${provisionResult.created}` : `Would create ${provisionResult.wouldCreate}`}</strong>
          <ul>
            {provisionResult.results.filter((r) => r.action !== 'skipped-unmapped').map((r, i) => (
              <li key={i}>
                {r.source}{r.target ? ` → ${r.target}` : ''} : <code>{r.action}</code>
                {r.error ? <span className="mig-row-error"> ({r.error})</span> : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plan table */}
      {loading ? (
        <div className="mig-loading">Loading migration plan…</div>
      ) : (
        <div className="mig-table-wrap">
          <table className="mig-table">
            <thead>
              <tr>
                <th>Source (M365)</th>
                <th>Destination (Google)</th>
                <th>Type</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.sourceMs365Id}>
                  <td><div className="mig-email">{t.sourceEmail}</div><div className="mig-sub">{t.sourceName}</div></td>
                  <td>{t.targetGoogleEmail || <span className="mig-sub">—</span>}</td>
                  <td><span className={`mig-type ${t.destinationType}`}>{t.destinationType}</span></td>
                  <td className="mig-data">
                    {(['mail', 'drive', 'calendar', 'contacts'] as const).filter((k) => t.transfer[k]).join(', ') || '—'}
                  </td>
                  <td>{badge(t)}</td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr><td colSpan={5} className="mig-empty">No Microsoft 365 sources. Connect Microsoft 365 and sync first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Run the transfer (Google console) */}
      <div className="mig-section">
        <h2>Run the transfer in Google</h2>
        <p className="mig-sub">Google's cross-cloud transfer runs in the Google Admin console — there's no start API. Provision destinations here, download the CSV, then run the import there.</p>
        <div className="mig-links">
          {CONSOLE_LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="mig-link">
              <ExternalLink size={14} /> {l.label}
            </a>
          ))}
        </div>
      </div>

      {/* Status (read-only, from data_migration audit stream) */}
      <div className="mig-section">
        <h2>Transfer progress</h2>
        {status?.summary && status.summary.total > 0 ? (
          <>
            <div className="mig-status-row">
              <span><CheckCircle2 size={14} /> {status.summary.total.toLocaleString()} events</span>
              {status.summary.failures > 0 && <span className="mig-row-error"><AlertTriangle size={14} /> {status.summary.failures.toLocaleString()} failures</span>}
            </div>
            {status.summary.truncated && (
              <p className="mig-sub mig-truncated">
                <AlertTriangle size={13} /> Counts are a lower bound — the audit window returned more pages than were read
                {status.summary.pagesFetched ? ` (${status.summary.pagesFetched} pages)` : ''}. Narrow the window or raise <code>maxPages</code> for an exact total.
              </p>
            )}
            <ul className="mig-status-breakdown">
              {Object.entries(status.summary.byName).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => (
                <li key={name}><code>{name}</code>: {n.toLocaleString()}</li>
              ))}
            </ul>

            {/* Per-migrated-user breakdown */}
            {status.byUser && status.byUser.length > 0 && (
              <div className="mig-table-wrap mig-status-table">
                <table className="mig-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Data migrated</th>
                      <th>Objects</th>
                      <th>Status</th>
                      <th>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.byUser.map((g, i) => (
                      <tr key={g.user || `grp-${i}`}>
                        <td><div className="mig-email">{g.user}</div></td>
                        <td className="mig-data">{dataSummary(g.byName)}</td>
                        <td>{g.total.toLocaleString()}</td>
                        <td>
                          {g.failures > 0
                            ? <span className="mig-badge mig-badge-fail"><AlertTriangle size={12} /> {g.failures.toLocaleString()} failed</span>
                            : <span className="mig-badge ready"><CheckCircle2 size={12} /> ok</span>}
                        </td>
                        <td className="mig-sub">{g.lastActivity ? new Date(g.lastActivity).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Failed-item detail (what failed, not just how many) */}
            {status.failures && status.failures.length > 0 && (
              <div className="mig-failures">
                <h3><AlertTriangle size={14} /> Failed items</h3>
                <ul className="mig-failures-list">
                  {status.failures.slice(0, 25).map((f, i) => (
                    <li key={i}>
                      {f.user && <div className="mig-email">{f.user}</div>}
                      <div className="mig-fail-path">
                        {f.source && <code>{f.source}</code>}
                        {f.source && f.target && ' → '}
                        {f.target && <code>{f.target}</code>}
                        {!f.source && !f.target && <span className="mig-sub">(no source/target reported)</span>}
                      </div>
                      {f.reason && <div className="mig-fail-reason">{f.reason}</div>}
                      {f.timestamp && <div className="mig-sub">{new Date(f.timestamp).toLocaleString()}</div>}
                    </li>
                  ))}
                </ul>
                {status.failures.length > 25 && (
                  <p className="mig-sub">Showing 25 of {status.summary.failures.toLocaleString()} failures. Narrow the window to see others.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mig-sub">No migration activity in the last 7 days. Once you start a transfer in Google, its progress (per-object events + failures) appears here.</p>
        )}
      </div>
    </div>
  );
}
