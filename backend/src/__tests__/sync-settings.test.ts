/**
 * The Advanced sync settings were decorative until 2026-09-11: never loaded, never
 * saved (wrong column), never read. These pin the contract the page, the routes and
 * the scheduler now share, and that bad input is refused rather than coerced.
 */
import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_SYNC_SETTINGS,
  SYNC_INTERVALS,
  validateSyncSettingsPatch,
  SyncSettingsError,
} from '../lib/sync-settings.js';

describe('sync settings', () => {
  it('defaults to every 15 minutes, automatic, delete in the platform', () => {
    expect(DEFAULT_SYNC_SETTINGS).toEqual({ intervalSeconds: 900, autoSyncEnabled: true, deletionDefault: 'delete' });
  });

  it('accepts exactly the intervals the page offers', () => {
    expect(SYNC_INTERVALS).toEqual([300, 900, 1800, 3600, 14400, 86400]);
    for (const n of SYNC_INTERVALS) expect(validateSyncSettingsPatch({ intervalSeconds: n })).toEqual({ intervalSeconds: n });
  });

  it('refuses an interval the page does not offer, rather than rounding it', () => {
    expect(() => validateSyncSettingsPatch({ intervalSeconds: 60 })).toThrow(SyncSettingsError);
    expect(() => validateSyncSettingsPatch({ intervalSeconds: 'soon' })).toThrow(SyncSettingsError);
  });

  it('refuses a non-boolean for automatic sync', () => {
    expect(() => validateSyncSettingsPatch({ autoSyncEnabled: 'false' })).toThrow(SyncSettingsError);
  });

  it('refuses an unknown deletion default', () => {
    expect(() => validateSyncSettingsPatch({ deletionDefault: 'archive' })).toThrow(SyncSettingsError);
    expect(validateSyncSettingsPatch({ deletionDefault: 'suspend' })).toEqual({ deletionDefault: 'suspend' });
  });

  it('keeps only known fields, so the retired syncDirection cannot be stored', () => {
    expect(validateSyncSettingsPatch({ syncDirection: 'bidirectional', autoSyncEnabled: false })).toEqual({ autoSyncEnabled: false });
  });
});
