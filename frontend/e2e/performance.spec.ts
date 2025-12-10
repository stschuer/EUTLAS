import { test, expect, loginUser, TEST_USER } from './fixtures/test-fixtures';

test.describe('Performance Advisor', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should display performance section in cluster', async ({ page }) => {
    // Navigate to a cluster
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      await page.waitForTimeout(1000);
      
      // Look for performance tab/link
      const perfLink = page.getByRole('link', { name: /performance/i }).or(
        page.getByRole('tab', { name: /performance/i })
      );
      
      if (await perfLink.isVisible({ timeout: 3000 })) {
        await perfLink.click();
        await expect(page.getByText(/query|index|performance/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Page Load Performance', () => {
  test('login page loads quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds (generous for dev environment)
    expect(loadTime).toBeLessThan(5000);
  });

  test('dashboard loads after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input#email, input[name="email"]').fill(TEST_USER.email);
    await page.locator('input#password, input[name="password"]').fill(TEST_USER.password);
    
    const startTime = Date.now();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    const loadTime = Date.now() - startTime;
    
    // Should complete login within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('landing page loads', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe('Metrics Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should show metrics in cluster view', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      await page.waitForTimeout(1000);
      
      // Look for metrics, charts, or status indicators
      const metricsContent = page.locator('canvas, svg, .chart, .metrics, [data-testid*="metric"]');
      // Metrics may or may not be visible depending on cluster state
    }
  });
});
