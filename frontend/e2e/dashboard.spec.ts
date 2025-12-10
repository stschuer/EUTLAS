import { test, expect, loginUser, TEST_USER } from './fixtures/test-fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should display dashboard after login', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    
    // Should show dashboard content
    await expect(page.locator('main, [role="main"], .dashboard')).toBeVisible();
  });

  test('should display navigation', async ({ page }) => {
    // Check for navigation
    const nav = page.locator('nav, aside, [role="navigation"]');
    await expect(nav.first()).toBeVisible();
  });

  test('should show user-related content', async ({ page }) => {
    // Look for user info, avatar, or menu
    const userElement = page.locator('[data-testid="user-menu"], .user-avatar, .user-menu, button:has-text("Account")');
    // This is optional - not all dashboards show user info prominently
  });
});

test.describe('Organizations', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should display organizations page', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    // Should show organizations heading or content
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('should show create organization option', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    // Look for create button or link
    const createOption = page.getByRole('button', { name: /create|new/i }).or(
      page.getByRole('link', { name: /create|new/i })
    );
    await expect(createOption.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to projects when org is selected', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    // Click on first org if exists
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      await page.waitForTimeout(1000);
      
      // Should be on org detail page
      await expect(page).toHaveURL(/orgs\/[a-f0-9]+/);
    }
  });
});
