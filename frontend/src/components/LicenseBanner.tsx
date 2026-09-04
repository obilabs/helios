import { useState } from 'react';
import { AlertTriangle, AlertOctagon, X } from 'lucide-react';
import './LicenseBanner.css';

/**
 * License-limit banners for the dashboard. Three escalating states driven off
 * consumed-vs-available seats:
 *   - near  (>=80% used): amber, dismissible — "getting close".
 *   - at    (used === available): orange, dismissible — you're full; new users
 *            won't get a license.
 *   - over  (used > available): red, PERMANENT (never dismissible) — some users
 *            have no license and likely have degraded mail/drive access.
 * `available` is stats.<platform>.licenses.total (the admin-configured limit, or
 * the provider-reported total for M365). No total -> no banner. Dismissal is
 * remembered per platform+state+total in localStorage, so a dismissed banner
 * reappears when the state escalates or the limit changes.
 */
interface LicenseInfo { used: number; total: number | null; providerTotal?: number | null; reportDate?: string | null; skuName?: string | null; }
interface PlatformStats { connected?: boolean; licenses?: LicenseInfo | null; }
interface Props { google?: PlatformStats | null; microsoft?: PlatformStats | null; }

type BannerState = 'near' | 'at' | 'over';
interface Banner { platform: string; label: string; state: BannerState; used: number; total: number; }

const NEAR_THRESHOLD = 0.8;

function computeBanner(platform: string, label: string, lic?: LicenseInfo | null): Banner | null {
  if (!lic || lic.total == null || lic.total <= 0) return null;
  const { used, total } = lic;
  // Name the specific SKU pool when we have one (M365 reports per-SKU), so an
  // "at limit" message is actionable rather than a vague platform-wide number.
  const effLabel = lic.skuName ? `${label} — ${lic.skuName}` : label;
  if (used > total) return { platform, label: effLabel, state: 'over', used, total };
  if (used === total) return { platform, label: effLabel, state: 'at', used, total };
  if (used / total >= NEAR_THRESHOLD) return { platform, label: effLabel, state: 'near', used, total };
  return null;
}

function dismissKey(b: Banner): string {
  return `licenseBannerDismissed:${b.platform}:${b.state}:${b.total}`;
}

function isDismissed(b: Banner): boolean {
  if (b.state === 'over') return false; // exceeded is permanent — never hidden
  try { return localStorage.getItem(dismissKey(b)) === '1'; } catch { return false; }
}

function message(b: Banner): string {
  const overBy = b.used - b.total;
  if (b.state === 'over') {
    return `${b.label}: ${b.used} licenses assigned but only ${b.total} available — ${overBy} ${overBy === 1 ? 'user has' : 'users have'} no license and may have degraded mail or drive access. Add licenses or remove users.`;
  }
  if (b.state === 'at') {
    return `${b.label}: all ${b.total} licenses are in use. New users won't receive a license until you add more.`;
  }
  return `${b.label}: ${b.used} of ${b.total} licenses used — you're approaching your limit.`;
}

export function LicenseBanner({ google, microsoft }: Props) {
  const [, force] = useState(0);

  const banners = [
    computeBanner('google', 'Google Workspace', google?.licenses),
    computeBanner('microsoft', 'Microsoft 365', microsoft?.licenses),
  ].filter((b): b is Banner => b !== null && !isDismissed(b));

  if (banners.length === 0) return null;

  const dismiss = (b: Banner) => {
    try { localStorage.setItem(dismissKey(b), '1'); } catch { /* localStorage unavailable — leave visible */ }
    force(x => x + 1);
  };

  return (
    <div className="license-banners">
      {banners.map(b => {
        const over = b.state === 'over';
        return (
          <div key={b.platform} className={`license-banner ${b.state}`} role="status">
            {over ? <AlertOctagon size={18} /> : <AlertTriangle size={18} />}
            <span className="license-banner-msg">{message(b)}</span>
            {!over && (
              <button className="license-banner-dismiss" aria-label="Dismiss" onClick={() => dismiss(b)}>
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
