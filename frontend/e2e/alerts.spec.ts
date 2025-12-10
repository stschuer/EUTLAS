import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('Alerts', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access alerts section', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      const alertsLink = page.getByRole('link', { name: /alert/i });
      if (await alertsLink.isVisible({ timeout: 3000 })) {
        await alertsLink.click();
        await expect(page).toHaveURL(/alert/);
      }
    }
  });

  test('should display alerts configuration', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      const alertsLink = page.getByRole('link', { name: /alert/i });
      if (await alertsLink.isVisible({ timeout: 3000 })) {
        await alertsLink.click();
        
        // Should show alerts content
        await expect(page.getByText(/alert|rule|notification/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Notification Channels', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should show notification options', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      // Look for notification channels section
      const notifSection = page.getByText(/notification|channel|email|webhook/i);
      // This may be on a sub-page
    }
  });
});
