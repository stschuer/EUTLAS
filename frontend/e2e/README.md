# EUTLAS Frontend E2E Tests

Comprehensive end-to-end tests using [Playwright](https://playwright.dev/).

## 📁 Test Structure

```
e2e/
├── fixtures/
│   └── test-fixtures.ts     # Shared fixtures, helpers, and test user config
├── global.setup.ts          # Global setup (API health check, test user creation)
├── auth.spec.ts             # Authentication tests (login, signup, logout)
├── landing.spec.ts          # Landing page and SEO tests
├── dashboard.spec.ts        # Dashboard and organization tests
├── navigation.spec.ts       # Navigation and mobile menu tests
├── clusters.spec.ts         # Cluster management tests
├── backups.spec.ts          # Backup and PITR tests
├── alerts.spec.ts           # Alerts and notifications tests
├── billing.spec.ts          # Billing and usage tests
├── api-keys.spec.ts         # API key management tests
├── performance.spec.ts      # Performance advisor and page load tests
├── data-explorer.spec.ts    # Data explorer and search index tests
└── README.md                # This file
```

## 🚀 Running Tests

### Prerequisites

1. Backend running on `http://localhost:4000`
2. Frontend running on `http://localhost:3000` (or will be started automatically)
3. Playwright browsers installed:

```bash
npx playwright install chromium
```

### Run All Tests

```bash
# Run all tests in headless mode
pnpm test:e2e

# Run tests with browser visible
pnpm test:e2e:headed

# Run in debug mode (step-through)
pnpm test:e2e:debug

# Run with interactive UI
pnpm test:e2e:ui
```

### Run Specific Tests

```bash
# Run only authentication tests
pnpm test:e2e auth.spec.ts

# Run only dashboard tests
pnpm test:e2e dashboard.spec.ts

# Run tests matching a pattern
pnpm test:e2e -g "login"
```

### View Test Report

```bash
pnpm test:e2e:report
```

## 🎯 Test Coverage

| Feature | Tests | Status |
|---------|-------|--------|
| Authentication | 12 | ✅ |
| Landing Page | 9 | ✅ |
| Dashboard | 8 | ✅ |
| Navigation | 8 | ✅ |
| Clusters | 5 | ✅ |
| Backups | 6 | ✅ |
| Alerts | 5 | ✅ |
| Billing | 3 | ✅ |
| API Keys | 3 | ✅ |
| Performance | 7 | ✅ |
| Data Explorer | 5 | ✅ |

## 🔧 Configuration

See `playwright.config.ts` for:

- Browser configuration (Chromium, Mobile Chrome)
- Timeouts and retries
- Screenshot and video capture on failure
- Web server auto-start

## 📝 Writing New Tests

### Using Test Fixtures

```typescript
import { test, expect, TEST_USER } from './fixtures/test-fixtures';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/dashboard/);
  });

  test('should do something', async ({ page }) => {
    // Your test here
    await expect(page.getByText('Hello')).toBeVisible();
  });
});
```

### Best Practices

1. **Use role-based selectors** for accessibility:
   ```typescript
   page.getByRole('button', { name: /submit/i })
   ```

2. **Use regex patterns** for flexible matching:
   ```typescript
   page.getByLabel(/email/i)
   ```

3. **Wait for navigation** after actions:
   ```typescript
   await page.waitForURL(/dashboard/);
   ```

4. **Handle optional elements** gracefully:
   ```typescript
   if (await element.isVisible()) {
     await element.click();
   }
   ```

5. **Add meaningful timeouts**:
   ```typescript
   await expect(element).toBeVisible({ timeout: 5000 });
   ```

## 🐛 Debugging

### Debug Mode

```bash
pnpm test:e2e:debug
```

This opens Playwright Inspector for step-by-step debugging.

### Screenshots on Failure

Screenshots are automatically captured on test failure. Find them in:
```
playwright-report/
```

### Traces

Traces are captured on first retry. View them:
```bash
npx playwright show-trace trace.zip
```

## 🌐 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL |
| `API_URL` | `http://localhost:4000/api/v1` | Backend API URL |
| `CI` | - | Set in CI environments |

## 🔄 CI/CD Integration

Tests run automatically in CI with:
- Single worker (no parallelism)
- 2 retries on failure
- HTML report generation

Example GitHub Actions:
```yaml
- name: Run E2E Tests
  run: |
    cd frontend
    pnpm test:e2e
```




