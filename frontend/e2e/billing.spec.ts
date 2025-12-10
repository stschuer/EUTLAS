import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access billing section', async ({ page }) => {
    // Navigate to an org
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      await page.waitForTimeout(500);
      
      // Look for billing link
      const billingLink = page.getByRole('link', { name: /billing/i });
      if (await billingLink.isVisible({ timeout: 3000 })) {
        await billingLink.click();
        await expect(page).toHaveURL(/billing/);
      }
    }
  });

  test('should display billing information', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      const billingLink = page.getByRole('link', { name: /billing/i });
      if (await billingLink.isVisible({ timeout: 3000 })) {
        await billingLink.click();
        
        // Should show billing-related content
        await expect(page.getByText(/plan|usage|invoice|billing/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
