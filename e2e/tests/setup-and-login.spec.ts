import { test, expect, Page } from '@playwright/test';
import { dismissViewOnboarding } from './utils/test-helpers';

/**
 * First-run UI coverage: the setup wizard and the login form.
 *
 * These two screens are the ONLY parts of the auth surface our headless/autonomous
 * runs never exercise, because those runs seed the admin via DEFAULT_ADMIN_* env
 * vars (backend seedDefaultAdmin) and authenticate over the API, skipping both
 * screens. This spec drives them for real, in a browser.
 *
 * Preconditions (handled by global-setup.auth-flows.ts):
 *   - The DB has been reset to a fresh-install state (no organization), so the
 *     app serves the setup wizard.
 *
 * Ordering: the tests are SERIAL and state-dependent. Test 1 (wizard) creates
 * the organization + admin that Test 2 (login) then signs in as. Each test still
 * gets its own fresh browser context (Playwright's default), so Test 2 proves a
 * genuine cold login, not a carried-over session.
 *
 * Filling the password field here is legitimate test automation with a fixture
 * password (below) — not an interactive agent typing a real secret.
 */

const ORG = {
  name: 'E2E First-Run Org',
  domain: 'e2e-firstrun.test',
};

const ADMIN = {
  firstName: 'Ada',
  lastName: 'Setup',
  email: 'e2e-admin@e2e-firstrun.test',
  // Throwaway fixture password for a disposable DB — NOT a real credential.
  // Overridable via env; the default is a lowercase fixture string (>= 8 chars,
  // satisfies the wizard + better-auth) that the committed-credential gate
  // recognises as a fixture rather than a secret (scripts/check-no-secrets.mjs).
  password: process.env.E2E_ADMIN_PASSWORD || 'e2e_first_run_pw_2026',
};

// Suppress the internal-admin "ViewOnboarding" modal so it never overlays the
// dashboard assertions. It gates purely on this localStorage key
// (ViewOnboarding.tsx: ONBOARDING_STORAGE_KEY), and addInitScript sets it before
// any app code runs, on every navigation in the context.
async function suppressViewOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('helios_view_onboarding_completed', 'true');
    localStorage.setItem('helios_view_preference', 'admin');
  });
}

// The authenticated shell is considered "loaded" when the login/setup form is
// gone and the admin dashboard is visible.
async function expectDashboard(page: Page): Promise<void> {
  await dismissViewOnboarding(page);
  await expect(page.locator('.dashboard-content')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('First-run: setup wizard and login form', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await suppressViewOnboarding(page);
  });

  test('setup wizard creates the organization and admin, then lands on the dashboard', async ({
    page,
  }) => {
    await page.goto('/');

    // Fresh DB -> setup wizard (not login).
    await expect(page.locator('.account-setup-container')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('heading', { name: /Welcome to Helios Admin Portal/i }),
    ).toBeVisible();

    // --- Step 1: Organization ---
    await expect(page.getByRole('heading', { name: 'Organization Information' })).toBeVisible();
    await page.fill('input[placeholder="Acme Corporation"]', ORG.name);
    await page.fill('input[placeholder="acme.com"]', ORG.domain);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- Step 2: Admin Account ---
    await expect(page.getByRole('heading', { name: 'Create Admin Account' })).toBeVisible();
    await page.fill('input[placeholder="John"]', ADMIN.firstName);
    await page.fill('input[placeholder="Doe"]', ADMIN.lastName);
    await page.fill('input[placeholder="admin@acme.com"]', ADMIN.email);
    await page.fill('input[placeholder="Minimum 8 characters"]', ADMIN.password);
    await page.fill('input[placeholder="Re-enter your password"]', ADMIN.password);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- Step 3: Theme (default selection is fine) ---
    await expect(page.getByRole('heading', { name: 'Choose Your Theme' })).toBeVisible();
    await page.getByRole('button', { name: /Complete Setup/i }).click();

    // --- Auto-login to the dashboard ---
    await expectDashboard(page);

    // Setup's auto-login side-effects (App.tsx onComplete stores these).
    const storedOrg = await page.evaluate(() => localStorage.getItem('helios_organization'));
    expect(storedOrg).toContain(ORG.name);
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    expect(token, 'setup auto-login should store helios_token').toBeTruthy();
  });

  test('login form signs the seeded admin in via better-auth and reaches the dashboard', async ({
    page,
    context,
  }) => {
    // Fresh context (Playwright default) => no session/localStorage carried over
    // from the wizard test. Belt-and-suspenders clear in case of reuse.
    await context.clearCookies();

    await page.goto('/');

    // Org now exists (created by the wizard test) -> app serves the login form.
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Helios Admin Portal' })).toBeVisible();
    // Exact match: a passkey-capable browser (Chromium) also renders a
    // "Sign in with Passkey" button, so /Sign In/i would be ambiguous.
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();

    // Drive the real login form. This hits better-auth /api/auth/sign-in/email,
    // whose bcrypt verify matches the hash the setup route wrote.
    await page.fill('input[type="email"]', ADMIN.email);
    await page.fill('input[type="password"]', ADMIN.password);
    await page.click('button[type="submit"]');

    // Login form disappears on success...
    await page.waitForSelector('input[type="email"]', { state: 'hidden', timeout: 20_000 });
    // ...and the dashboard renders.
    await expectDashboard(page);

    // Login flow (LoginPage.tsx) writes these for UI display after getSession().
    const storedUser = await page.evaluate(() => localStorage.getItem('helios_user'));
    expect(storedUser).toContain(ADMIN.email);
    const storedOrg = await page.evaluate(() => localStorage.getItem('helios_organization'));
    expect(storedOrg, 'login should store helios_organization').toBeTruthy();

    // better-auth issues an httpOnly session cookie (cookiePrefix "helios").
    // In production NODE_ENV it is emitted with a `__Secure-` prefix, e.g.
    // `__Secure-helios.session_token`, so match the `helios.session` core.
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => /helios\.session/i.test(c.name));
    expect(
      sessionCookie,
      `expected a helios better-auth session cookie, got: ${cookies.map((c) => c.name).join(', ')}`,
    ).toBeTruthy();
  });

  test('login form rejects a wrong password', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20_000 });

    await page.fill('input[type="email"]', ADMIN.email);
    await page.fill('input[type="password"]', 'definitely-the-wrong-password');
    await page.click('button[type="submit"]');

    // Stays on the login form and surfaces an error; never reaches the dashboard.
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('.dashboard-content')).toHaveCount(0);
  });
});
