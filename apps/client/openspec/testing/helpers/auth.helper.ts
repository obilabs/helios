import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'user';
}

export class AuthHelper {
  private users: Map<string, TestUser>;
  private currentUser: TestUser | null = null;

  constructor() {
    this.users = new Map();
    this.loadTestUsers();
  }

  /**
   * Load test users from fixture
   */
  private loadTestUsers(): void {
    const fixturePath = path.join(__dirname, '../fixtures/users.json');

    if (fs.existsSync(fixturePath)) {
      const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
      Object.entries(data).forEach(([key, value]) => {
        this.users.set(key, value as TestUser);
      });
    } else {
      // Default test users
      this.users.set('admin', {
        email: 'admin@test.helios.local',
        password: 'AdminTest123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      });

      this.users.set('user', {
        email: 'user@test.helios.local',
        password: 'UserTest123!',
        firstName: 'Regular',
        lastName: 'User',
        role: 'user'
      });

      this.users.set('manager', {
        email: 'manager@test.helios.local',
        password: 'ManagerTest123!',
        firstName: 'Manager',
        lastName: 'User',
        role: 'manager'
      });
    }
  }

  /**
   * Login with credentials
   */
  async login(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login');

    // Wait for login form
    await page.waitForSelector('[data-test="login-form"]', { timeout: 10000 });

    // Fill credentials
    await page.fill('[data-test="email-input"]', email);
    await page.fill('[data-test="password-input"]', password);

    // Submit form
    await page.click('[data-test="login-button"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    console.log(`✅ Logged in as: ${email}`);
  }

  /**
   * Login as admin user
   */
  async loginAsAdmin(page: Page): Promise<TestUser> {
    const admin = this.users.get('admin')!;
    await this.login(page, admin.email, admin.password);
    this.currentUser = admin;
    return admin;
  }

  /**
   * Login as regular user
   */
  async loginAsUser(page: Page): Promise<TestUser> {
    const user = this.users.get('user')!;
    await this.login(page, user.email, user.password);
    this.currentUser = user;
    return user;
  }

  /**
   * Login as manager
   */
  async loginAsManager(page: Page): Promise<TestUser> {
    const manager = this.users.get('manager')!;
    await this.login(page, manager.email, manager.password);
    this.currentUser = manager;
    return manager;
  }

  /**
   * Login with role
   */
  async loginWithRole(page: Page, role: 'admin' | 'manager' | 'user'): Promise<TestUser> {
    const user = Array.from(this.users.values()).find(u => u.role === role);
    if (!user) {
      throw new Error(`No test user found with role: ${role}`);
    }

    await this.login(page, user.email, user.password);
    this.currentUser = user;
    return user;
  }

  /**
   * Logout current user
   */
  async logout(page: Page): Promise<void> {
    // Click user menu
    await page.click('[data-test="user-menu"]');

    // Click logout
    await page.click('[data-test="logout-button"]');

    // Wait for redirect to login
    await page.waitForURL('**/login', { timeout: 10000 });

    this.currentUser = null;
    console.log('✅ Logged out');
  }

  /**
   * Get current user
   */
  getCurrentUser(): TestUser | null {
    return this.currentUser;
  }

  /**
   * Create a new user via UI
   */
  async createUser(page: Page, userData: Partial<TestUser>): Promise<void> {
    // Navigate to add user page
    await page.goto('/add-user');

    // Fill user form
    if (userData.email) {
      await page.fill('[data-test="email-input"]', userData.email);
    }
    if (userData.firstName) {
      await page.fill('[data-test="first-name-input"]', userData.firstName);
    }
    if (userData.lastName) {
      await page.fill('[data-test="last-name-input"]', userData.lastName);
    }
    if (userData.password) {
      await page.fill('[data-test="password-input"]', userData.password);
    }
    if (userData.role) {
      await page.selectOption('[data-test="role-select"]', userData.role);
    }

    // Submit form
    await page.click('[data-test="create-user-button"]');

    // Wait for success
    await page.waitForSelector('[data-test="success-message"]', { timeout: 10000 });

    console.log(`✅ User created: ${userData.email}`);
  }

  /**
   * Setup password for user
   */
  async setupPassword(page: Page, token: string, newPassword: string): Promise<void> {
    // Navigate to setup password page with token
    await page.goto(`/setup-password?token=${token}`);

    // Fill new password
    await page.fill('[data-test="new-password-input"]', newPassword);
    await page.fill('[data-test="confirm-password-input"]', newPassword);

    // Submit form
    await page.click('[data-test="setup-password-button"]');

    // Wait for redirect to login
    await page.waitForURL('**/login', { timeout: 10000 });

    console.log('✅ Password setup completed');
  }

  /**
   * Reset password
   */
  async resetPassword(page: Page, email: string): Promise<void> {
    // Navigate to login page
    await page.goto('/login');

    // Click forgot password
    await page.click('[data-test="forgot-password-link"]');

    // Enter email
    await page.fill('[data-test="reset-email-input"]', email);

    // Submit form
    await page.click('[data-test="reset-password-button"]');

    // Wait for success message
    await page.waitForSelector('[data-test="reset-email-sent"]', { timeout: 10000 });

    console.log(`✅ Password reset email sent to: ${email}`);
  }

  /**
   * Verify user is logged in
   */
  async verifyLoggedIn(page: Page): Promise<boolean> {
    try {
      // Check for user menu presence
      await page.waitForSelector('[data-test="user-menu"]', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication token from localStorage
   */
  async getAuthToken(page: Page): Promise<string | null> {
    return await page.evaluate(() => {
      return localStorage.getItem('token');
    });
  }

  /**
   * Set authentication token in localStorage
   */
  async setAuthToken(page: Page, token: string): Promise<void> {
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
    }, token);
  }

  /**
   * Clear authentication
   */
  async clearAuth(page: Page): Promise<void> {
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    });
    this.currentUser = null;
  }
}

export default AuthHelper;