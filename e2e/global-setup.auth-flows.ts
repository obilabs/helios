import type { FullConfig } from '@playwright/test';
import { resetHeliosDatabase } from './tests/utils/db-reset';

/**
 * Global setup for the first-run auth-flow suite.
 *
 * Playwright starts `webServer` (waits for {BASE_URL}/health) BEFORE this runs,
 * so by the time we get here the app is reachable. We then:
 *
 *   1. Reset the DB to a fresh-install state (no organization) — the
 *      "disposable DB state" the setup-wizard test depends on.
 *   2. Prove, over HTTP, that the running app now reports setup as incomplete.
 *      If it doesn't, fail here (loud) instead of letting the wizard test fail
 *      with a confusing "expected wizard, got login" later.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    process.env.BASE_URL || (config.projects[0]?.use?.baseURL as string) || 'http://localhost:8083';

  resetHeliosDatabase();

  const res = await fetch(`${baseURL}/api/v1/organization/setup/status`);
  if (!res.ok) {
    throw new Error(`GET ${baseURL}/api/v1/organization/setup/status returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: { isSetupComplete?: boolean } };
  if (body?.data?.isSetupComplete) {
    throw new Error(
      'After DB reset the app still reports isSetupComplete=true. ' +
        'The setup wizard will not be shown — aborting.',
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[auth-flows] Fresh DB confirmed at ${baseURL} — setup wizard will be served.`);
}
