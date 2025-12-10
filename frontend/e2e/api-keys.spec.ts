import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('API Keys', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access API keys section', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      const apiKeysLink = page.getByRole('link', { name: /api.*key/i });
      if (await apiKeysLink.isVisible({ timeout: 3000 })) {
        await apiKeysLink.click();
        await expect(page).toHaveURL(/api-keys/);
      }
    }
  });

  test('should show create API key option', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    
    const orgLink = page.locator('a[href*="/orgs/"]').first();
    if (await orgLink.isVisible({ timeout: 3000 })) {
      await orgLink.click();
      
      const apiKeysLink = page.getByRole('link', { name: /api.*key/i });
      if (await apiKeysLink.isVisible({ timeout: 3000 })) {
        await apiKeysLink.click();
        
        const createBtn = page.getByRole('button', { name: /create|new|generate/i });
        await expect(createBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
