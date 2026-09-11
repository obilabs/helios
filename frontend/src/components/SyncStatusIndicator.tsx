import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { authFetch } from '../config/api';
import { PlatformIcon } from './ui/PlatformIcon';
import './SyncStatusIndicator.css';

interface PlatformSync {
  lastSync: string | null;
  userCount: number;
}

interface SyncStatus {
  google: PlatformSync | null;
  microsoft: PlatformSync | null;
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
   * Sync one platform. Only Google has a sync-now endpoint today, so the
   * Microsoft stamp is a read-only indicator rather than a button that looks
   * clickable and does nothing.
   */
  const runSync = async (platform: 'google' | 'microsoft') => {
    if (!isAdmin || syncing || platform !== 'google') return;
    setSyncing(platform);
    setError(null);
    try {
      const res = await authFetch('/api/v1/google-workspace/sync-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const detail = data.error;
        setError(
          (typeof detail === 'string' ? detail : detail?.message) ||
            data.message ||
            `Sync failed (${res.status})`,
        );
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Sync failed');
    } finally {
      setSyncing(null);
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
        const stale = mins === null || mins >= STALE_MINUTES;
        const canSync = isAdmin && stamp.key === 'google';
        const isSyncing = syncing === stamp.key;
        const isOpen = openKey === stamp.key;

        // Hover answers "when?"; click opens the details. Clicking the stamp used
        // to START a sync, which surprised admins who clicked expecting to read
        // something. Syncing is now an explicit button inside the details.
        const hover = `${stamp.label} · synced ${ago(stamp.lastSync)} · click for details`;

        return (
          <div className="sync-status-wrap" key={stamp.key}>
            <button
              type="button"
              className={`sync-status ${stale ? 'is-stale' : ''} ${error && isSyncing ? 'has-error' : ''} is-actionable`}
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
                <span className="sync-status-text">{ago(stamp.lastSync)}</span>
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
                {error && stamp.key === 'google' && (
                  <p className="sync-status-error">{error}</p>
                )}
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
                  <p className="sync-status-note">
                    {stamp.key === 'microsoft'
                      ? 'Microsoft 365 syncs on its schedule. Manual sync is not available for it yet.'
                      : 'Only an admin can start a sync.'}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
