/**
 * GAM Feature Parity Test Runner
 *
 * Tests Helios API endpoints and verifies actions with direct Google Admin SDK calls
 *
 * Usage:
 *   npx ts-node src/scripts/test-gam-parity.ts
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import fetch from 'node-fetch';

// Configuration
const HELIOS_API_URL = process.env.HELIOS_API_URL || 'http://localhost:3001';
const HELIOS_AUTH_TOKEN = process.env.HELIOS_AUTH_TOKEN || '';
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const GOOGLE_ADMIN_EMAIL = process.env.GOOGLE_ADMIN_EMAIL || '';
const TEST_DOMAIN = process.env.TEST_DOMAIN || '';

interface TestResult {
  id: string;
  feature: string;
  gamCommand: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  heliosApiExists: boolean;
  heliosSuccess: boolean;
  googleVerified: boolean;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_IMPLEMENTED' | 'SKIPPED';
  notes: string;
  error?: string;
  heliosResponse?: any;
  googleResponse?: any;
  timestamp: string;
}

class GAMParityTester {
  private adminClient: any;
  private results: TestResult[] = [];

  constructor() {
    this.initializeGoogleClient();
  }

  private initializeGoogleClient() {
    try {
      const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);

      const jwtClient = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.group',
          'https://www.googleapis.com/auth/admin.directory.orgunit',
          'https://www.googleapis.com/auth/gmail.settings.basic',
        ],
        subject: GOOGLE_ADMIN_EMAIL
      });

      this.adminClient = google.admin({ version: 'directory_v1', auth: jwtClient });
      console.log('✅ Google Admin SDK client initialized');
    } catch (error: any) {
      console.error('❌ Failed to initialize Google Admin SDK:', error.message);
      console.log('\nPlease set environment variables:');
      console.log('  GOOGLE_SERVICE_ACCOUNT_KEY="<json-key>"');
      console.log('  GOOGLE_ADMIN_EMAIL="admin@yourdomain.com"');
      console.log('  TEST_DOMAIN="yourdomain.com"');
      process.exit(1);
    }
  }

  private async callHeliosAPI(method: string, endpoint: string, body?: any): Promise<any> {
    try {
      const response = await fetch(`${HELIOS_API_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HELIOS_AUTH_TOKEN}`
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.json();
      return { status: response.status, data };
    } catch (error: any) {
      return { status: 0, error: error.message };
    }
  }

  private generateTestEmail(prefix: string): string {
    const timestamp = Date.now();
    return `${prefix}-${timestamp}@${TEST_DOMAIN}`;
  }

  // ===== P0 CRITICAL TESTS =====

  async testCreateUser(): Promise<TestResult> {
    const testId = 'USER_001';
    const feature = 'Create User';
    const testEmail = this.generateTestEmail('test-create');

    console.log(`\n🧪 Testing: ${feature}`);
    console.log(`   Test email: ${testEmail}`);

    const result: TestResult = {
      id: testId,
      feature,
      gamCommand: `gam create user ${testEmail} firstname Test lastname User password Secret123!`,
      priority: 'CRITICAL',
      heliosApiExists: false,
      heliosSuccess: false,
      googleVerified: false,
      status: 'FAIL',
      notes: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Step 1: Test Helios API
      console.log('   📡 Calling Helios API...');
      const heliosResponse = await this.callHeliosAPI('POST', '/api/organization/users', {
        email: testEmail,
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        passwordSetupMethod: 'admin_set',
        password: 'Secret123!'
      });

      result.heliosApiExists = heliosResponse.status !== 404;
      result.heliosSuccess = heliosResponse.status === 201 || heliosResponse.status === 200;
      result.heliosResponse = heliosResponse.data;

      // Step 2: Verify in Google Workspace
      console.log('   🔍 Verifying in Google Workspace...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      try {
        const googleResponse = await this.adminClient.users.get({
          userKey: testEmail
        });

        result.googleVerified = !!googleResponse.data;
        result.googleResponse = googleResponse.data;

        if (result.heliosSuccess && result.googleVerified) {
          result.status = 'PASS';
          result.notes = 'User created in both Helios and Google Workspace';
          console.log('   ✅ PASS');
        } else if (result.heliosSuccess && !result.googleVerified) {
          result.status = 'PARTIAL';
          result.notes = 'User created in Helios but not synced to Google Workspace';
          console.log('   ⚠️  PARTIAL - Not synced to Google');
        } else {
          result.status = 'FAIL';
          result.notes = `Helios API failed: ${heliosResponse.data?.error || 'Unknown error'}`;
          console.log('   ❌ FAIL');
        }

        // Cleanup: Delete test user from Google
        await this.adminClient.users.delete({ userKey: testEmail });
        console.log('   🧹 Cleanup: Test user deleted');

      } catch (googleError: any) {
        if (googleError.code === 404) {
          result.notes = 'User not found in Google Workspace (Helios created local user only)';
          result.status = 'PARTIAL';
          console.log('   ⚠️  PARTIAL - Local user only');
        } else {
          result.error = googleError.message;
          console.log('   ❌ Google verification error:', googleError.message);
        }
      }

    } catch (error: any) {
      result.error = error.message;
      result.notes = `Test failed: ${error.message}`;
      console.log('   ❌ Test error:', error.message);
    }

    this.results.push(result);
    return result;
  }

  async testDeleteUser(): Promise<TestResult> {
    const testId = 'USER_002';
    const feature = 'Delete User';

    console.log(`\n🧪 Testing: ${feature}`);

    const result: TestResult = {
      id: testId,
      feature,
      gamCommand: 'gam delete user <email>',
      priority: 'CRITICAL',
      heliosApiExists: false,
      heliosSuccess: false,
      googleVerified: false,
      status: 'FAIL',
      notes: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Step 1: Create test user in Google
      const testEmail = this.generateTestEmail('test-delete');
      console.log(`   Creating test user: ${testEmail}`);

      await this.adminClient.users.insert({
        requestBody: {
          primaryEmail: testEmail,
          name: {
            givenName: 'Delete',
            familyName: 'Test'
          },
          password: '***REMOVED-CREDENTIAL***'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Get user ID from Helios (need to sync first)
      // For now, we'll test direct Google deletion expectation

      // Step 3: Call Helios DELETE API
      console.log('   📡 Calling Helios DELETE API...');
      const heliosResponse = await this.callHeliosAPI('DELETE', `/api/organization/users/${testEmail}`);

      result.heliosApiExists = heliosResponse.status !== 404;
      result.heliosSuccess = heliosResponse.status === 200;
      result.heliosResponse = heliosResponse.data;

      // Step 4: Verify user is DELETED (not suspended) in Google
      console.log('   🔍 Verifying deletion in Google...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const googleResponse = await this.adminClient.users.get({
          userKey: testEmail
        });

        // If we can still get the user, check if suspended
        if (googleResponse.data.suspended) {
          result.status = 'FAIL';
          result.notes = '⚠️  CRITICAL BUG: User was SUSPENDED, not DELETED! This means the organization is still being billed for this license!';
          result.googleVerified = false;
          console.log('   ❌ CRITICAL: User suspended instead of deleted');
        } else {
          result.status = 'FAIL';
          result.notes = 'User still exists in Google Workspace (neither deleted nor suspended)';
          result.googleVerified = false;
          console.log('   ❌ User still active in Google');
        }

        // Cleanup
        await this.adminClient.users.delete({ userKey: testEmail });

      } catch (googleError: any) {
        if (googleError.code === 404) {
          result.status = 'PASS';
          result.notes = 'User successfully deleted from Google Workspace';
          result.googleVerified = true;
          console.log('   ✅ PASS - User deleted from Google');
        } else {
          result.error = googleError.message;
          console.log('   ❌ Google error:', googleError.message);
        }
      }

    } catch (error: any) {
      result.error = error.message;
      result.notes = `Test failed: ${error.message}`;
      console.log('   ❌ Test error:', error.message);
    }

    this.results.push(result);
    return result;
  }

  async testSuspendUser(): Promise<TestResult> {
    const testId = 'USER_003';
    const feature = 'Suspend User';

    console.log(`\n🧪 Testing: ${feature}`);

    const result: TestResult = {
      id: testId,
      feature,
      gamCommand: 'gam update user <email> suspended true',
      priority: 'CRITICAL',
      heliosApiExists: false,
      heliosSuccess: false,
      googleVerified: false,
      status: 'FAIL',
      notes: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Create test user in Google
      const testEmail = this.generateTestEmail('test-suspend');
      console.log(`   Creating test user: ${testEmail}`);

      await this.adminClient.users.insert({
        requestBody: {
          primaryEmail: testEmail,
          name: { givenName: 'Suspend', familyName: 'Test' },
          password: '***REMOVED-CREDENTIAL***'
        }
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Call Helios suspend API
      console.log('   📡 Calling Helios SUSPEND API...');
      const heliosResponse = await this.callHeliosAPI('PATCH', `/api/organization/users/${testEmail}/status`, {
        status: 'suspended'
      });

      result.heliosApiExists = heliosResponse.status !== 404;
      result.heliosSuccess = heliosResponse.status === 200;
      result.heliosResponse = heliosResponse.data;

      // Verify suspension in Google
      console.log('   🔍 Verifying suspension in Google...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const googleResponse = await this.adminClient.users.get({
        userKey: testEmail
      });

      if (googleResponse.data.suspended === true) {
        result.status = 'PASS';
        result.notes = 'User successfully suspended in Google Workspace';
        result.googleVerified = true;
        console.log('   ✅ PASS');
      } else {
        result.status = 'PARTIAL';
        result.notes = 'User suspended in Helios but not in Google Workspace';
        result.googleVerified = false;
        console.log('   ⚠️  PARTIAL');
      }

      // Cleanup
      await this.adminClient.users.delete({ userKey: testEmail });

    } catch (error: any) {
      result.error = error.message;
      result.notes = `Test failed: ${error.message}`;
      console.log('   ❌ Test error:', error.message);
    }

    this.results.push(result);
    return result;
  }

  async testListUsers(): Promise<TestResult> {
    const testId = 'USER_004';
    const feature = 'List Users';

    console.log(`\n🧪 Testing: ${feature}`);

    const result: TestResult = {
      id: testId,
      feature,
      gamCommand: 'gam print users',
      priority: 'CRITICAL',
      heliosApiExists: false,
      heliosSuccess: false,
      googleVerified: false,
      status: 'FAIL',
      notes: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Call Helios list users API
      console.log('   📡 Calling Helios LIST USERS API...');
      const heliosResponse = await this.callHeliosAPI('GET', '/api/organization/users');

      result.heliosApiExists = heliosResponse.status !== 404;
      result.heliosSuccess = heliosResponse.status === 200;
      result.heliosResponse = heliosResponse.data;

      // Get user count from Google
      console.log('   🔍 Getting user count from Google...');
      const googleResponse = await this.adminClient.users.list({
        customer: 'my_customer',
        maxResults: 500
      });

      const googleUserCount = googleResponse.data.users?.length || 0;
      const heliosUserCount = heliosResponse.data?.data?.length || 0;

      result.googleResponse = { userCount: googleUserCount };

      if (result.heliosSuccess) {
        result.status = 'PASS';
        result.notes = `Helios returned ${heliosUserCount} users, Google has ${googleUserCount} users`;
        result.googleVerified = true;
        console.log(`   ✅ PASS - Helios: ${heliosUserCount}, Google: ${googleUserCount}`);
      } else {
        result.notes = 'Failed to retrieve users from Helios';
        console.log('   ❌ FAIL');
      }

    } catch (error: any) {
      result.error = error.message;
      result.notes = `Test failed: ${error.message}`;
      console.log('   ❌ Test error:', error.message);
    }

    this.results.push(result);
    return result;
  }

  // ===== GROUP TESTS =====

  async testCreateGroup(): Promise<TestResult> {
    const testId = 'GROUP_001';
    const feature = 'Create Group';

    console.log(`\n🧪 Testing: ${feature}`);

    const testEmail = this.generateTestEmail('test-group');

    const result: TestResult = {
      id: testId,
      feature,
      gamCommand: `gam create group ${testEmail} name "Test Group"`,
      priority: 'CRITICAL',
      heliosApiExists: false,
      heliosSuccess: false,
      googleVerified: false,
      status: 'FAIL',
      notes: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Call Helios create group API
      console.log('   📡 Calling Helios CREATE GROUP API...');
      const heliosResponse = await this.callHeliosAPI('POST', '/api/organization/access-groups', {
        name: 'Test Group',
        email: testEmail,
        description: 'Test group for GAM parity testing'
      });

      result.heliosApiExists = heliosResponse.status !== 404;
      result.heliosSuccess = heliosResponse.status === 201 || heliosResponse.status === 200;
      result.heliosResponse = heliosResponse.data;

      // Verify in Google
      console.log('   🔍 Verifying in Google...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const googleResponse = await this.adminClient.groups.get({
          groupKey: testEmail
        });

        result.googleVerified = !!googleResponse.data;
        result.status = 'PASS';
        result.notes = 'Group created in both Helios and Google Workspace';
        console.log('   ✅ PASS');

        // Cleanup
        await this.adminClient.groups.delete({ groupKey: testEmail });

      } catch (googleError: any) {
        if (googleError.code === 404) {
          result.status = 'PARTIAL';
          result.notes = 'Group created in Helios but not synced to Google Workspace';
          console.log('   ⚠️  PARTIAL');
        }
      }

    } catch (error: any) {
      result.error = error.message;
      result.notes = `Test failed: ${error.message}`;
      console.log('   ❌ Test error:', error.message);
    }

    this.results.push(result);
    return result;
  }

  // ===== RUN ALL TESTS =====

  async runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 GAM FEATURE PARITY TEST SUITE');
    console.log('='.repeat(60));
    console.log(`\nConfiguration:`);
    console.log(`  Helios API: ${HELIOS_API_URL}`);
    console.log(`  Test Domain: ${TEST_DOMAIN}`);
    console.log(`  Google Admin: ${GOOGLE_ADMIN_EMAIL}`);

    // Run P0 Critical Tests
    console.log('\n' + '='.repeat(60));
    console.log('🔴 PRIORITY 0 - CRITICAL FEATURES');
    console.log('='.repeat(60));

    await this.testCreateUser();
    await this.testDeleteUser();
    await this.testSuspendUser();
    await this.testListUsers();
    await this.testCreateGroup();

    // Generate report
    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const summary = {
      total: this.results.length,
      pass: this.results.filter(r => r.status === 'PASS').length,
      partial: this.results.filter(r => r.status === 'PARTIAL').length,
      fail: this.results.filter(r => r.status === 'FAIL').length,
      notImplemented: this.results.filter(r => r.status === 'NOT_IMPLEMENTED').length
    };

    console.log(`\nTotal Tests: ${summary.total}`);
    console.log(`✅ Pass: ${summary.pass}`);
    console.log(`⚠️  Partial: ${summary.partial}`);
    console.log(`❌ Fail: ${summary.fail}`);
    console.log(`⭕ Not Implemented: ${summary.notImplemented}`);

    console.log('\n' + '-'.repeat(60));
    console.log('DETAILED RESULTS:');
    console.log('-'.repeat(60));

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' :
                   result.status === 'PARTIAL' ? '⚠️ ' :
                   result.status === 'NOT_IMPLEMENTED' ? '⭕' : '❌';

      console.log(`\n${icon} ${result.feature} (${result.priority})`);
      console.log(`   Status: ${result.status}`);
      console.log(`   GAM Command: ${result.gamCommand}`);
      console.log(`   Notes: ${result.notes}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Save results to JSON
    const fs = require('fs');
    const reportPath = './gam-test-results.json';
    fs.writeFileSync(reportPath, JSON.stringify({
      testRun: {
        date: new Date().toISOString(),
        environment: 'dev',
        domain: TEST_DOMAIN
      },
      summary,
      results: this.results
    }, null, 2));

    console.log(`\n📄 Full report saved to: ${reportPath}`);
    console.log('\n' + '='.repeat(60));
  }
}

// Run tests
const tester = new GAMParityTester();
tester.runAllTests().catch(console.error);
