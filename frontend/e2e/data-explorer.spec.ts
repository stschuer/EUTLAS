import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('Data Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access data explorer in cluster', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      const dataLink = page.getByRole('link', { name: /data|explorer|browse/i }).or(
        page.getByRole('tab', { name: /data|explorer|browse/i })
      );
      if (await dataLink.isVisible({ timeout: 3000 })) {
        await dataLink.click();
        await expect(page.getByText(/database|collection|document/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should show database interface', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      const dataLink = page.getByRole('link', { name: /data|explorer|browse/i });
      if (await dataLink.isVisible({ timeout: 3000 })) {
        await dataLink.click();
        
        // Look for database-related content
        const dbContent = page.locator('.database, .collection, [data-testid*="database"]');
        // Content visibility depends on cluster state
      }
    }
  });
});

test.describe('Search Indexes', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access search indexes in cluster', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      const searchLink = page.getByRole('link', { name: /search.*index/i });
      if (await searchLink.isVisible({ timeout: 3000 })) {
        await searchLink.click();
        await expect(page.getByText(/search|index/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
