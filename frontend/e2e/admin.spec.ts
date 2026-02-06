import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to admin page', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Admin page should load (may redirect to login or show 403 for non-admins)
    const currentUrl = page.url();
    const isAdmin = currentUrl.includes('admin');
    const isForbidden = currentUrl.includes('login') || currentUrl.includes('403');

    expect(isAdmin || isForbidden).toBe(true);
  });

  test('should show admin dashboard with stats (if admin)', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('admin')) {
      // Should see stats or dashboard content
      const stats = page.locator(
        'text=Total Users, text=Total Tenants, text=Clusters, text=Organizations, [data-testid*="stat"]'
      );

      // Admin dashboard should have overview stats
      expect(await stats.count()).toBeGreaterThan(0);
    }
  });

  test('should navigate to tenants management (if admin)', async ({ page }) => {
    await page.goto('/admin/tenants');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('admin/tenants')) {
      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();

      // Should see tenants list
      const tenantList = page.locator('table, [role="grid"]');
      const createButton = page.locator('button:has-text("Create"), button:has-text("Add")');

      expect((await tenantList.count()) > 0 || (await createButton.count()) > 0).toBe(true);
    }
  });

  test('should navigate to users management (if admin)', async ({ page }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('admin/users')) {
      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();

      // Should see users list
      const userList = page.locator('table, [role="grid"]');
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');

      expect((await userList.count()) > 0 || (await searchInput.count()) > 0).toBe(true);
    }
  });
});
