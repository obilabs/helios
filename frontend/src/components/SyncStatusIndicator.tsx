import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { authFetch } from '../config/api';
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

/**
 * How old the directory data on screen is. A dashboard that looks live while
 * the underlying sync last ran hours ago is the quiet version of the failure
 * mode this product exists to remove, so the age is always visible and turns
 * amber once it is worth doubting.
 */
export function SyncStatusIndicator({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
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

  const runSync = async () => {
    if (!isAdmin || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/google-workspace/sync-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || data.message || `Sync failed (${res.status})`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Nothing connected yet: no stamp to show.
  if (!status || (!status.google && !status.microsoft)) return null;

  const stamps = [
    status.google ? { label: 'Google', ...status.google } : null,
    status.microsoft ? { label: 'Microsoft 365', ...status.microsoft } : null,
  ].filter(Boolean) as Array<{ label: string; lastSync: string | null; userCount: number }>;

  const oldest = stamps.reduce<number | null>((worst, s) => {
    const mins = minutesSince(s.lastSync);
    if (mins === null) return worst === null ? Number.MAX_SAFE_INTEGER : worst;
    return worst === null ? mins : Math.max(worst, mins);
  }, null);

  const stale = oldest !== null && oldest >= 60;
  const primary = stamps[0];

  const title = [
    ...stamps.map((s) => `${s.label}: synced ${ago(s.lastSync)} (${s.userCount} users)`),
    isAdmin ? 'Click to sync now' : '',
    error || '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      className={`sync-status ${stale ? 'is-stale' : ''} ${error ? 'has-error' : ''}`}
      title={title}
      onClick={runSync}
      disabled={!isAdmin || syncing}
      aria-label={title}
    >
      <RefreshCw size={13} className={syncing ? 'spin' : ''} />
      <span className="sync-status-text">
        {syncing ? 'Syncing...' : `Synced ${ago(primary.lastSync)}`}
      </span>
    </button>
  );
}
