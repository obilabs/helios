/**
 * Canonical Google Workspace SKU catalog — SINGLE SOURCE OF TRUTH.
 *
 * Two prior copies (google-workspace.service.ts and licenses.routes.ts) had the
 * numeric SKU ids mislabeled and disagreed with each other AND with Google
 * (e.g. 1010020025 Business Plus was shown as "Enterprise Plus" / "Frontline
 * Starter"), so a Business Plus tenant was mis-tiered and any license-gating
 * built on those labels would mis-gate. Use THIS catalog everywhere.
 *
 * Source: Google "Product and SKU IDs" (developers.google.com/admin-sdk/
 * licensing/v1/how-tos/products). Product 'Google-Apps' base editions below.
 */

export type GoogleTier =
  | 'business_starter'
  | 'business_standard'
  | 'business_plus'
  | 'enterprise_starter'
  | 'enterprise_standard'
  | 'enterprise_plus'
  | 'enterprise_essentials'
  | 'enterprise_essentials_plus'
  | 'frontline_starter'
  | 'frontline_standard'
  | 'frontline_plus'
  | 'legacy'
  | 'addon';

export interface GoogleSku {
  name: string;
  tier: GoogleTier;
}

/** skuId -> { name, tier }. Includes modern numeric ids + common legacy string ids. */
export const GOOGLE_WORKSPACE_SKUS: Record<string, GoogleSku> = {
  // --- Business ---
  '1010020027': { name: 'Business Starter', tier: 'business_starter' },
  '1010020028': { name: 'Business Standard', tier: 'business_standard' },
  '1010020025': { name: 'Business Plus', tier: 'business_plus' },
  // --- Enterprise ---
  '1010020029': { name: 'Enterprise Starter', tier: 'enterprise_starter' },
  '1010020026': { name: 'Enterprise Standard', tier: 'enterprise_standard' },
  '1010020020': { name: 'Enterprise Plus', tier: 'enterprise_plus' },
  '1010060003': { name: 'Enterprise Essentials', tier: 'enterprise_essentials' },
  '1010060005': { name: 'Enterprise Essentials Plus', tier: 'enterprise_essentials_plus' },
  // --- Frontline ---
  '1010020030': { name: 'Frontline Starter', tier: 'frontline_starter' },
  '1010020031': { name: 'Frontline Standard', tier: 'frontline_standard' },
  '1010020034': { name: 'Frontline Plus', tier: 'frontline_plus' },
  // --- Legacy G Suite (string SKU ids) ---
  'Google-Apps-For-Business': { name: 'G Suite Basic (legacy)', tier: 'legacy' },
  'Google-Apps-Unlimited': { name: 'G Suite Business (legacy)', tier: 'legacy' },
  'Google-Apps-Lite': { name: 'G Suite Lite (legacy)', tier: 'legacy' },
};

/** Vault add-on lives under productId 101031 (separate from the base edition). */
export const GOOGLE_VAULT_SKUS: Record<string, GoogleSku> = {
  'Google-Vault': { name: 'Vault', tier: 'addon' },
  'Google-Vault-Former-Employee': { name: 'Vault Former Employee', tier: 'addon' },
};

/** Human-readable SKU name; falls back to the raw id if unknown (never guesses a tier). */
export function skuName(skuId: string): string {
  return (
    GOOGLE_WORKSPACE_SKUS[skuId]?.name ??
    GOOGLE_VAULT_SKUS[skuId]?.name ??
    skuId
  );
}

/** Canonical tier for entitlement checks, or null if unknown. */
export function skuTier(skuId: string): GoogleTier | null {
  return GOOGLE_WORKSPACE_SKUS[skuId]?.tier ?? GOOGLE_VAULT_SKUS[skuId]?.tier ?? null;
}

/**
 * Feature entitlement by tier (minimum-edition gates, for license-aware feature
 * flags — resolve capabilities from the union of assigned SKUs, render
 * "needs <edition>" instead of hitting a raw Google 403).
 */
const TIER_RANK: Record<GoogleTier, number> = {
  legacy: 0,
  frontline_starter: 1,
  business_starter: 1,
  frontline_standard: 2,
  business_standard: 2,
  frontline_plus: 3,
  business_plus: 3,
  enterprise_starter: 3,
  enterprise_essentials: 3,
  enterprise_standard: 4,
  enterprise_essentials_plus: 4,
  enterprise_plus: 5,
  addon: 0,
};

/** True if `have` meets or exceeds `min` on the rough edition ladder. */
export function tierMeets(have: GoogleTier | null, min: GoogleTier): boolean {
  if (!have) return false;
  return TIER_RANK[have] >= TIER_RANK[min];
}
