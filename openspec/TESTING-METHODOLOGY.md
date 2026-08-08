# OpenSpec Automated Testing Methodology

## Overview
This document defines the automated testing methodology that integrates with OpenSpec to ensure 100% specification coverage through automated testing, including screenshots, user flows, and data validation.

## Core Principles

### 1. Specification-Driven Testing (SDT)
Every test MUST originate from an OpenSpec specification. No test exists without a spec, and no spec exists without a test.

### 2. Evidence-Based Validation
Every test execution MUST produce evidence:
- Screenshots at critical points
- API response logs
- Database state snapshots
- Performance metrics

### 3. Continuous Verification
Tests run automatically on:
- Every code commit
- Every OpenSpec change
- Scheduled daily full regression
- Before any deployment

## Architecture

```
openspec/
├── changes/                      # OpenSpec changes
│   └── {change-name}/
│       ├── specs/
│       │   └── *.md             # Specifications
│       └── tests/               # Auto-generated tests
│           ├── generated/       # Generated from specs
│           ├── custom/          # Hand-written tests
│           └── evidence/        # Screenshots & logs
│
├── testing/
│   ├── framework/               # Testing framework
│   │   ├── spec-parser.ts      # Parse specs into tests
│   │   ├── test-generator.ts   # Generate test code
│   │   ├── test-runner.ts      # Execute tests
│   │   └── reporter.ts         # Generate reports
│   │
│   ├── fixtures/                # Test data
│   │   ├── users.json
│   │   ├── organizations.json
│   │   └── csv-templates/
│   │
│   ├── helpers/                 # Test utilities
│   │   ├── auth.helper.ts
│   │   ├── database.helper.ts
│   │   └── screenshot.helper.ts
│   │
│   └── reports/                 # Test results
│       ├── latest/
│       ├── history/
│       └── coverage/
```

## Test Generation Process

### Step 1: Parse OpenSpec
```typescript
// spec-parser.ts
interface SpecRequirement {
  id: string;
  requirement: string;
  scenarios: Scenario[];
}

interface Scenario {
  given: string[];
  when: string[];
  then: string[];
  examples?: any[];
}

class SpecParser {
  parseSpecFile(specPath: string): SpecRequirement[] {
    // Extract requirements and scenarios
    // Convert markdown to structured data
  }
}
```

### Step 2: Generate Test Code
```typescript
// test-generator.ts
class TestGenerator {
  generateFromSpec(spec: SpecRequirement): string {
    return `
      test.describe('${spec.requirement}', () => {
        ${spec.scenarios.map(scenario => `
          test('${scenario.when.join(' ')}', async ({ page, api, db }) => {
            // Given
            ${this.generateGiven(scenario.given)}

            // When
            ${this.generateWhen(scenario.when)}

            // Then
            ${this.generateThen(scenario.then)}

            // Evidence
            await screenshot(page, '${spec.id}_${Date.now()}');
          });
        `).join('\n')}
      });
    `;
  }
}
```

### Step 3: Execute Tests
```typescript
// test-runner.ts
class TestRunner {
  async runTests(change: string) {
    const specs = await this.loadSpecs(change);
    const tests = await this.generateTests(specs);

    const results = await playwright.test.run({
      tests,
      screenshot: 'on',
      video: 'retain-on-failure',
      trace: 'retain-on-failure'
    });

    return this.generateReport(results);
  }
}
```

## Test Categories

### 1. Unit Tests
- Generated from technical specs
- Test individual functions/methods
- No UI interaction required

### 2. Integration Tests
- Generated from API specs
- Test service interactions
- Database state validation

### 3. E2E Tests
- Generated from user stories
- Full user journey testing
- Screenshot at each step

### 4. Performance Tests
- Generated from performance requirements
- Load testing
- Response time validation

## Screenshot Strategy

### Automatic Screenshot Points
1. **Before Action**: Capture initial state
2. **After Action**: Capture result
3. **On Assertion**: Capture validation
4. **On Failure**: Capture error state

### Screenshot Naming Convention
```
{spec-id}_{scenario-id}_{step}_{timestamp}.png

Example:
user-creation_admin-creates-user_after-submit_1698765432.png
```

### Screenshot Storage
```
evidence/
├── screenshots/
│   ├── passed/
│   │   └── {date}/
│   ├── failed/
│   │   └── {date}/
│   └── baseline/       # Reference screenshots
├── videos/
└── traces/
```

## Test Implementation Examples

### Example 1: User Creation Test
```typescript
// Generated from: openspec/changes/add-user-management/specs/user-creation.md

test.describe('Requirement: User Creation', () => {
  test('Admin creates new user with all fields', async ({ page, api, db, screenshot }) => {
    // Given: Admin is logged in
    await auth.loginAsAdmin(page);
    await screenshot.capture('user-creation-logged-in');

    // When: Admin navigates to Add User
    await page.click('[data-test="add-user-button"]');
    await page.waitForURL('**/add-user');
    await screenshot.capture('user-creation-form-empty');

    // And: Fills in user details
    await page.fill('[data-test="email"]', 'test@example.com');
    await page.fill('[data-test="firstName"]', 'John');
    await page.fill('[data-test="lastName"]', 'Doe');
    await page.fill('[data-test="password"]', 'SecurePass123!');
    await page.selectOption('[data-test="role"]', 'user');
    await screenshot.capture('user-creation-form-filled');

    // And: Submits the form
    await page.click('[data-test="submit-button"]');

    // Then: User is created successfully
    await expect(page).toHaveURL('**/users');
    await expect(page.locator('[data-test="success-message"]')).toBeVisible();
    await screenshot.capture('user-creation-success');

    // And: User appears in database
    const user = await db.query('SELECT * FROM organization_users WHERE email = $1', ['test@example.com']);
    expect(user.rows).toHaveLength(1);

    // And: User can login
    await auth.logout(page);
    await auth.login(page, 'test@example.com', 'SecurePass123!');
    await expect(page).toHaveURL('**/dashboard');
    await screenshot.capture('user-creation-new-user-logged-in');
  });
});
```

### Example 2: CSV Bulk Upload Test
```typescript
// Generated from: openspec/changes/add-bulk-operations/specs/csv-upload.md

test.describe('Requirement: CSV Bulk Upload', () => {
  test('Upload users via CSV with validation', async ({ page, api, screenshot }) => {
    // Given: Admin has a valid CSV file
    const csvContent = `email,firstName,lastName,password,role
john@example.com,John,Smith,Pass123!,user
jane@example.com,Jane,Doe,Pass456!,admin`;

    const csvFile = await createTempFile('users.csv', csvContent);

    // When: Admin uploads CSV
    await page.goto('/bulk-operations');
    await screenshot.capture('bulk-upload-initial');

    await page.selectOption('[data-test="operation-type"]', 'user_create');
    await page.setInputFiles('[data-test="csv-upload"]', csvFile);
    await screenshot.capture('bulk-upload-file-selected');

    // Then: Preview shows correctly
    await page.click('[data-test="preview-button"]');
    await expect(page.locator('[data-test="preview-table"] tbody tr')).toHaveCount(2);
    await screenshot.capture('bulk-upload-preview');

    // When: Admin confirms upload
    await page.click('[data-test="confirm-upload"]');

    // Then: Progress is shown
    await expect(page.locator('[data-test="progress-bar"]')).toBeVisible();
    await screenshot.capture('bulk-upload-progress');

    // And: Success is reported
    await page.waitForSelector('[data-test="upload-complete"]');
    await expect(page.locator('[data-test="success-count"]')).toHaveText('2');
    await expect(page.locator('[data-test="error-count"]')).toHaveText('0');
    await screenshot.capture('bulk-upload-complete');
  });
});
```

### Example 3: Helpdesk Real-time Presence Test
```typescript
// Generated from: openspec/changes/add-group-mailbox-helpdesk/specs/helpdesk/spec.md

test.describe('Requirement: Real-time Presence System', () => {
  test('Multiple agents viewing same ticket', async ({ browser, screenshot }) => {
    // Given: Two agents are logged in
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await auth.login(page1, 'agent1@example.com', 'pass');

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await auth.login(page2, 'agent2@example.com', 'pass');

    // When: Agent 1 opens a ticket
    await page1.goto('/helpdesk');
    await page1.click('[data-test="ticket-1"]');
    await screenshot.capture('presence-agent1-viewing', page1);

    // And: Agent 2 opens the same ticket
    await page2.goto('/helpdesk');
    await page2.click('[data-test="ticket-1"]');

    // Then: Agent 1 sees Agent 2's presence
    await expect(page1.locator('[data-test="presence-indicator"]')).toContainText('Agent Two');
    await screenshot.capture('presence-agent1-sees-agent2', page1);

    // And: Agent 2 sees Agent 1's presence
    await expect(page2.locator('[data-test="presence-indicator"]')).toContainText('Agent One');
    await screenshot.capture('presence-agent2-sees-agent1', page2);

    // When: Agent 2 starts typing
    await page2.click('[data-test="reply-field"]');
    await page2.type('[data-test="reply-field"]', 'Testing...');

    // Then: Agent 1 sees typing indicator
    await expect(page1.locator('[data-test="typing-indicator"]')).toContainText('Agent Two is typing');
    await screenshot.capture('presence-typing-indicator', page1);
  });
});
```

## Test Data Management

### Fixtures Structure
```json
// fixtures/users.json
{
  "admin": {
    "email": "admin@test.com",
    "password": "AdminPass123!",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin"
  },
  "user": {
    "email": "user@test.com",
    "password": "UserPass123!",
    "firstName": "Regular",
    "lastName": "User",
    "role": "user"
  }
}
```

### Database Seeding
```typescript
// helpers/database.helper.ts
class DatabaseHelper {
  async seed(scenario: string) {
    const seeds = await this.loadSeeds(scenario);
    await this.clearDatabase();
    await this.insertSeeds(seeds);
  }

  async snapshot() {
    return await this.db.query('SELECT * FROM information_schema.tables');
  }

  async restore(snapshot: any) {
    await this.db.restore(snapshot);
  }
}
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/openspec-tests.yml
name: OpenSpec Automated Tests

on:
  push:
    paths:
      - 'openspec/**'
      - 'src/**'
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Test Environment
        run: |
          docker-compose up -d
          npm install
          npm run build

      - name: Generate Tests from Specs
        run: npm run test:generate

      - name: Run Tests
        run: npm run test:all

      - name: Upload Evidence
        if: always()
        uses: actions/upload-artifact@v2
        with:
          name: test-evidence
          path: |
            openspec/testing/reports/
            openspec/**/tests/evidence/

      - name: Update OpenSpec Status
        run: npm run openspec:update-status
```

## Reporting

### Test Report Structure
```markdown
# OpenSpec Test Report
Date: 2025-10-31
Coverage: 95.3%

## Summary
- Total Specs: 47
- Tested Specs: 45
- Passed: 43
- Failed: 2
- Skipped: 2

## Failed Tests
### ❌ user-creation: Admin creates user with duplicate email
- Spec: openspec/changes/add-user-management/specs/user-creation.md#L45
- Error: Expected error message not shown
- Screenshot: [evidence/failed/2025-10-31/user-creation-duplicate-email.png]

### ❌ bulk-operations: CSV with 10000 rows
- Spec: openspec/changes/add-bulk-operations/specs/performance.md#L12
- Error: Timeout after 30 seconds
- Screenshot: [evidence/failed/2025-10-31/bulk-upload-timeout.png]

## Coverage Gaps
- [ ] openspec/changes/add-sso/specs/oauth.md - No tests generated
- [ ] openspec/changes/add-audit-log/specs/retention.md - Manual testing required
```

## Implementation Commands

### Setup Testing Framework
```bash
# Install testing dependencies
npm install --save-dev @playwright/test playwright
npm install --save-dev @faker-js/faker
npm install --save-dev csv-parse csv-stringify

# Initialize Playwright
npx playwright install
npx playwright install-deps

# Create testing structure
mkdir -p openspec/testing/{framework,fixtures,helpers,reports}
```

### Generate and Run Tests
```bash
# Generate tests from specs
npm run test:generate

# Run all tests
npm run test:all

# Run specific change tests
npm run test:change add-helpdesk

# Run with UI mode
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Benefits

1. **100% Spec Coverage**: Every specification is automatically tested
2. **Evidence Trail**: Screenshots prove every test execution
3. **Regression Prevention**: Tests run automatically on every change
4. **Living Documentation**: Tests serve as executable documentation
5. **Reduced Manual Testing**: Automated tests replace manual verification
6. **Faster Releases**: Confidence to deploy with comprehensive test coverage
7. **OpenSpec Integration**: Tests are generated directly from specifications

## Next Steps

1. Install Playwright: `npm install --save-dev @playwright/test`
2. Create test generator: Implement spec-parser.ts and test-generator.ts
3. Generate initial tests: Parse existing OpenSpec files
4. Set up CI/CD: Configure GitHub Actions
5. Create baseline screenshots: Run tests once to capture baseline
6. Enable continuous testing: Activate on commit hooks

This methodology ensures that every OpenSpec specification is automatically tested with full evidence capture, making it impossible for untested code to reach production.