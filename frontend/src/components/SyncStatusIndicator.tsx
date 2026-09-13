import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { authFetch } from '../config/api';
import { PlatformIcon } from './ui/PlatformIcon';
import './SyncStatusIndicator.css';

interface PlatformSync {
  lastSync: string | null;
  userCount: number;
  /** Where the platform records it: 'syncing' | 'completed' | 'failed'. */
  state?: string | null;
  error?: string | null;
}

interface SyncStatus {
  google: PlatformSync | null;
  microsoft: PlatformSync | null;
  /** The schedule as it actually runs (from the server), not as a setting claims. */
  schedule?: { autoSyncEnabled: boolean; intervalSeconds: number; scheduled: boolean; nextSyncAt: string | null };
}

/** "every 15 minutes, next in 7" / "automatic sync is off", from the real schedule. */
function scheduleNote(schedule: SyncStatus['schedule']): string {
  if (!schedule) return '';
  if (!schedule.autoSyncEnabled || !schedule.scheduled) return 'Automatic sync is off.';
  const every = schedule.intervalSeconds >= 3600
    ? `${Math.round(schedule.intervalSeconds / 3600)} hr`
    : `${Math.round(schedule.intervalSeconds / 60)} min`;
  let next = '';
  if (schedule.nextSyncAt) {
    const mins = Math.max(0, Math.round((new Date(schedule.nextSyncAt).getTime() - Date.now()) / 60000));
    next = mins < 1 ? ' · next in under a minute' : ` · next in ${mins} min`;
  }
  return `Sync interval: ${every}${next}`;
}

/** "just now", "6m", "3h", "2d" — short enough for a header. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'unknown';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 60000);
}

/** Past this, the number on screen is worth doubting. */
const STALE_MINUTES = 60;

/**
 * How old the directory data on screen is, per platform.
 *
 * This originally showed ONE stamp naming whichever platform was furthest
 * behind, on the theory that surfacing the stalest thing is safest. On a real
 * tenant that was actively misleading: Microsoft at three days owned a header
 * sitting above a directory that is almost entirely Google, and Google had
 * synced moments earlier. Aggregating two independent facts produced a third
 * fact that was true of neither.
 *
 * So each connected platform now carries its own stamp and its own colour.
 * There is nothing left to aggregate, so there is nothing left to be wrong
 * about. With one platform connected it degrades to a single stamp.
 *
 * They are deliberately NOT synced together on one clock: the two run on
 * different schedules and fail in different ways, and the moment one is broken
 * that difference is exactly what you want to see.
 */
export function SyncStatusIndicator({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<'google' | 'microsoft' | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  // Close the details on an outside click or Escape.
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey]);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/organization/sync-status');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus(data.data);
        setError(null);
      }
    } catch {
      // A failed poll is not worth shouting about; the stamp simply stops moving.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  /**
   * Sync one platform and wait for the real outcome.
   *
   * Google's endpoint runs the sync before answering. Microsoft's answers
   * "Sync started" immediately and runs it in the background, so success is
   * only known when its recorded last-sync time moves or its state says failed.
   * The first version of this component wired Google only and left the
   * Microsoft stamp inert, so clicking it did nothing while it read "3d ago".
   */
  const runSync = async (platform: 'google' | 'microsoft') => {
    if (!isAdmin || syncing) return;
    setSyncing(platform);
    setError(null);
    const before = status?.[platform]?.lastSync ?? null;
    try {
      const url = platform === 'google' ? '/api/v1/google-workspace/sync-now' : '/api/v1/microsoft/sync';
      const res = await authFetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const detail = data.error;
        setError(
          (typeof detail === 'string' ? detail : detail?.message) || data.message || `Sync failed (${res.status})`,
        );
        return;
      }
      if (platform === 'microsoft') {
        // Poll for the background sync to land, for up to a minute.
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const r2 = await authFetch('/api/v1/organization/sync-status');
          const d2 = await r2.json().catch(() => ({}));
          const ms = d2?.data?.microsoft;
          if (d2?.success) setStatus(d2.data);
          if (ms?.state === 'failed') { setError(ms.error || 'Microsoft 365 sync failed'); return; }
          if (ms?.lastSync && ms.lastSync !== before) return;
        }
        setError('The sync has not finished after a minute. It may still be running; check back shortly.');
        return;
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Sync failed');
    } finally {
      setSyncing(null);
      await load();
    }
  };

  // Nothing connected yet: no stamp to show.
  if (!status || (!status.google && !status.microsoft)) return null;

  const stamps = ([
    status.google ? { key: 'google' as const, label: 'Google Workspace', ...status.google } : null,
    status.microsoft
      ? { key: 'microsoft' as const, label: 'Microsoft 365', ...status.microsoft }
      : null,
  ].filter(Boolean) as Array<{
    key: 'google' | 'microsoft';
    label: string;
    lastSync: string | null;
    userCount: number;
    state?: string | null;
    error?: string | null;
  }>);

  /** Local date and time, for the details panel. The stamp itself stays relative. */
  const absolute = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : 'never';

  return (
    <div className="sync-status-group" role="group" aria-label="Directory sync status" ref={groupRef}>
      {stamps.map((stamp) => {
        const mins = minutesSince(stamp.lastSync);
        const failed = stamp.state === 'failed';
        const stale = failed || mins === null || mins >= STALE_MINUTES;
        const canSync = isAdmin;
        const isSyncing = syncing === stamp.key;
        const isOpen = openKey === stamp.key;

        // Hover answers "when?"; click opens the details. Clicking the stamp used
        // to START a sync, which surprised admins who clicked expecting to read
        // something. Syncing is now an explicit button inside the details.
        const hover = failed && stamp.error
          ? `${stamp.label} · last sync FAILED: ${stamp.error} · click for details`
          : `${stamp.label} · synced ${ago(stamp.lastSync)} · click for details`;

        return (
          <div className="sync-status-wrap" key={stamp.key}>
            <button
              type="button"
              className={`sync-status ${stale ? 'is-stale' : ''} ${failed || (error && openKey === stamp.key) ? 'has-error' : ''} is-actionable`}
              title={hover}
              aria-label={hover}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              onClick={() => setOpenKey(isOpen ? null : stamp.key)}
            >
              {/* The logo carries its own "Google Workspace" tooltip, which the
                  browser showed instead of the sync time. It is made inert to
                  the pointer so hovering reaches the stamp's own tooltip. */}
              <span className="sync-status-icon" aria-hidden="true">
                <PlatformIcon platform={stamp.key} size={13} />
              </span>
              {isSyncing ? (
                <RefreshCw size={12} className="spin" />
              ) : (
                <>
                  <span className="sync-status-text">{ago(stamp.lastSync)}</span>
                  {/* A broken connection must not look like a healthy one. The sign is
                      always visible; the reason is one hover away, so nothing overflows. */}
                  {failed && <AlertTriangle size={12} className="sync-status-warn" aria-hidden="true" />}
                </>
              )}
            </button>

            {isOpen && (
              <div className="sync-status-details" role="dialog" aria-label={`${stamp.label} sync details`}>
                <div className="sync-status-details-title">
                  <PlatformIcon platform={stamp.key} size={14} />
                  <span>{stamp.label}</span>
                </div>
                <dl>
                  <div><dt>Last synced</dt><dd>{ago(stamp.lastSync)}<span className="sync-status-abs">{absolute(stamp.lastSync)}</span></dd></div>
                  <div><dt>Users at that sync</dt><dd>{stamp.userCount}</dd></div>
                </dl>
                {failed && stamp.error && <p className="sync-status-error">Last sync failed: {stamp.error}</p>}
                {error && isOpen && <p className="sync-status-error">{error}</p>}
                {canSync ? (
                  <button
                    type="button"
                    className="btn-primary sync-status-now"
                    onClick={() => runSync(stamp.key)}
                    disabled={isSyncing}
                  >
                    <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
                    {isSyncing ? 'Syncing…' : 'Sync now'}
                  </button>
                ) : (
                  <p className="sync-status-note">Only an admin can start a sync.</p>
                )}
                <p className="sync-status-note">{scheduleNote(status?.schedule)}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
