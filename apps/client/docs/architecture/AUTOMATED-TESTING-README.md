# 🧪 Automated Testing with OpenSpec Integration

## Overview

This project implements a comprehensive automated testing framework that integrates seamlessly with the OpenSpec methodology. The system automatically generates Playwright E2E tests from OpenSpec markdown specifications, ensuring that all requirements are tested systematically.

## Key Features

- **Specification-Driven Testing**: Tests are automatically generated from OpenSpec markdown files
- **Screenshot Evidence**: Automated screenshot capture for visual verification
- **Database Seeding**: Test data management with PostgreSQL integration
- **Multi-Browser Support**: Tests run on Chrome, Firefox, and WebKit
- **Parallel Execution**: Tests run in parallel for faster feedback
- **CI/CD Ready**: Full support for continuous integration pipelines

## Quick Start

### 1. Install Dependencies

```bash
npm install
npx playwright install
```

### 2. Generate Tests from Specs

```bash
npm run test:generate
```

This command scans all OpenSpec files and generates corresponding Playwright tests.

### 3. Run Tests

```bash
# Run all tests
npm test

# Run specific test
npm run test:auth

# Run tests in headed mode (with browser visible)
npm test -- --headed

# Run tests for specific browser
npm test -- --project=chromium
```

## Project Structure

```
helios-client/
├── openspec/
│   ├── TESTING-METHODOLOGY.md       # Testing strategy document
│   ├── testing/
│   │   ├── framework/               # Core testing framework
│   │   │   ├── spec-parser.ts      # Parses OpenSpec markdown
│   │   │   └── test-generator.ts   # Generates Playwright tests
│   │   ├── helpers/                # Test utilities
│   │   │   ├── auth.helper.ts      # Authentication helpers
│   │   │   ├── database.helper.ts  # Database operations
│   │   │   ├── screenshot.helper.ts # Screenshot capture
│   │   │   └── test-data.helper.ts # Test data generation
│   │   ├── fixtures/               # Test data
│   │   │   ├── users.json         # Test user accounts
│   │   │   └── seeds/             # Database seed files
│   │   ├── tests/                 # Generated test files
│   │   └── generate-tests.ts      # Test generation script
├── playwright.config.ts            # Playwright configuration
└── package.json                   # Project dependencies
```

## Test Generation Process

### 1. Write OpenSpec Files

Create specification files in markdown format with test scenarios:

```markdown
### Requirement: User Login

Users must be able to login with valid credentials.

#### Scenario: Successful Login
- **GIVEN** A user with valid credentials
- **WHEN** They submit the login form
- **THEN** They should be redirected to the dashboard
```

### 2. Generate Tests

Run the test generation command:

```bash
npm run test:generate
```

This will:
- Parse all `spec.md` files in the project
- Extract test requirements and scenarios
- Generate Playwright test files
- Create helper imports and test structure

### 3. Generated Test Structure

The generator creates tests with this structure:

```typescript
test.describe('User Login', () => {
  test('Successful Login', async ({ page }) => {
    // GIVEN: Setup
    await authHelper.loginAsAdmin(page);

    // WHEN: Action
    await page.click('[data-test="login-button"]');

    // THEN: Assertion
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Evidence
    await screenshotHelper.capture(page, 'login-success');
  });
});
```

## Test Helpers

### Authentication Helper

```typescript
const authHelper = new AuthHelper();

// Login methods
await authHelper.loginAsAdmin(page);
await authHelper.loginAsUser(page);
await authHelper.loginAsManager(page);

// User management
await authHelper.createUser(page, userData);
await authHelper.logout(page);
```

### Database Helper

```typescript
const dbHelper = new DatabaseHelper();

// Seed test data
await dbHelper.seed('authentication');

// Query data
const user = await dbHelper.findOne('organization_users', { email: 'test@example.com' });

// Clean up
await dbHelper.cleanup();
```

### Screenshot Helper

```typescript
const screenshot = new ScreenshotHelper('feature-name');

// Capture screenshots
await screenshot.capture(page, 'test-step');
await screenshot.captureElement(page, '[data-test="form"]', 'form-state');

// Compare with baseline
const matches = await screenshot.compare(page, 'baseline-name');

// Generate report
await screenshot.createReport();
```

### Test Data Helper

```typescript
const testData = new TestDataHelper();

// Generate test data
const users = testData.generateUsers(10);
const csvPath = await testData.createCSVFile('users.csv', users);

// Clean up
await testData.cleanup();
```

## Configuration

### Playwright Configuration

The `playwright.config.ts` file configures:

- **Test directory**: `./openspec`
- **Parallel execution**: Enabled
- **Browsers**: Chrome, Firefox, WebKit, Mobile
- **Screenshots**: On failure
- **Videos**: On failure
- **HTML reports**: Generated automatically

### Environment Variables

Create a `.env.test` file for test-specific configuration:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=helios_client_test
DB_USER=postgres
DB_PASSWORD=postgres
BASE_URL=http://localhost:3000
```

## Writing Tests

### Test Attributes

Use data attributes for reliable element selection:

```html
<button data-test="login-button">Login</button>
<input data-test="email-input" />
<div data-test="error-message"></div>
```

### Best Practices

1. **Use Page Object Model**: Create page objects for complex pages
2. **Isolate Tests**: Each test should be independent
3. **Seed Data**: Use database helpers to set up test data
4. **Clean Up**: Always clean up test data after tests
5. **Take Screenshots**: Capture evidence at key points

## Running Tests in CI/CD

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:generate
      - run: npm run test:ci
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: openspec/testing/reports/
```

## Test Reports

### HTML Report

After running tests, view the HTML report:

```bash
npx playwright show-report
```

### Screenshot Report

Screenshots are organized by test session:

```
openspec/testing/reports/screenshots/
├── 2025-10-31T10-00-00/
│   ├── login-page.png
│   ├── dashboard.png
│   └── metadata.json
```

### JUnit Report

For CI/CD integration, JUnit reports are generated:

```
openspec/testing/reports/junit.xml
```

## Bulk Operations Testing

The framework includes specialized support for bulk operations:

```typescript
test('Upload users via CSV', async ({ page }) => {
  // Generate test CSV
  const users = testData.generateUsers(100);
  const csvPath = await testData.createCSVFile('users.csv', users);

  // Upload file
  await page.setInputFiles('[data-test="csv-upload"]', csvPath);

  // Verify results
  const count = await dbHelper.count('organization_users');
  expect(count).toBe(100);
});
```

## Debugging Tests

### Debug Mode

Run tests in debug mode to step through:

```bash
npm run test:debug
```

### Headed Mode

See the browser while tests run:

```bash
npm test -- --headed
```

### Slow Motion

Slow down test execution:

```bash
npm test -- --headed --slow-mo=1000
```

## Extending the Framework

### Adding New Helpers

Create new helpers in `openspec/testing/helpers/`:

```typescript
export class CustomHelper {
  async doSomething(page: Page): Promise<void> {
    // Helper logic
  }
}
```

### Custom Test Generators

Extend the test generator for specific patterns:

```typescript
class CustomGenerator extends TestGenerator {
  generateCustomTest(spec: CustomSpec): string {
    // Generate custom test code
  }
}
```

## Troubleshooting

### Common Issues

1. **Tests fail locally but pass in CI**
   - Check environment variables
   - Ensure database is seeded correctly
   - Verify service dependencies are running

2. **Screenshot mismatches**
   - Update baseline screenshots
   - Check viewport settings
   - Ensure consistent font rendering

3. **Database connection errors**
   - Verify PostgreSQL is running
   - Check connection string
   - Ensure test database exists

### Debug Output

Enable debug logging:

```bash
DEBUG=pw:api npm test
```

## Performance Tips

1. **Run tests in parallel**: Use `fullyParallel: true` in config
2. **Share authentication state**: Use storage state for logged-in sessions
3. **Minimize database operations**: Use snapshots instead of re-seeding
4. **Cache test data**: Generate once, reuse across tests

## Contributing

### Adding Tests

1. Write OpenSpec requirements
2. Generate tests
3. Verify generated tests
4. Add custom logic if needed
5. Run tests locally
6. Submit PR with passing tests

### Test Coverage

Ensure tests cover:
- Happy paths
- Error scenarios
- Edge cases
- Performance requirements
- Security requirements

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [OpenSpec Methodology](./openspec/TESTING-METHODOLOGY.md)
- [Test Examples](./openspec/testing/tests/)
- [Helper Documentation](./openspec/testing/helpers/)

## Summary

This automated testing framework provides:

- ✅ **100% Spec Coverage**: All requirements have corresponding tests
- ✅ **Visual Evidence**: Screenshots document test execution
- ✅ **Data Integrity**: Database helpers ensure consistent state
- ✅ **Multi-Browser**: Tests run across all major browsers
- ✅ **CI/CD Ready**: Full integration with deployment pipelines
- ✅ **Developer Friendly**: Easy to write, run, and debug tests

By integrating with OpenSpec, we ensure that:
- Every requirement is tested
- Tests stay in sync with specifications
- Evidence is automatically captured
- Quality is maintained throughout development