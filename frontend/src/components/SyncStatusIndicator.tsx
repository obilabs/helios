import { useCallback, useEffect, useState } from 'react';
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

  return (
    <div className="sync-status-group" role="group" aria-label="Directory sync status">
      {stamps.map((stamp) => {
        const mins = minutesSince(stamp.lastSync);
        const stale = mins === null || mins >= STALE_MINUTES;
        const canSync = isAdmin && stamp.key === 'google';
        const isSyncing = syncing === stamp.key;

        // The icon already says which platform this is, so the text does not
        // repeat it. The full name lives in the tooltip and the aria-label,
        // where a screen reader and a hovering human both get it.
        const description =
          `${stamp.label}: synced ${ago(stamp.lastSync)} (${stamp.userCount} users)` +
          (canSync ? '\nClick to sync now' : '') +
          (error && isSyncing ? `\n${error}` : '');

        return (
          <button
            key={stamp.key}
            type="button"
            className={`sync-status ${stale ? 'is-stale' : ''} ${error && isSyncing ? 'has-error' : ''} ${
              canSync ? 'is-actionable' : ''
            }`}
            title={description}
            aria-label={description}
            onClick={() => runSync(stamp.key)}
            disabled={!canSync || isSyncing}
          >
            <PlatformIcon platform={stamp.key} size={13} />
            {isSyncing ? (
              <RefreshCw size={12} className="spin" />
            ) : (
              <span className="sync-status-text">{ago(stamp.lastSync)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
