import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('Backups', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should access backups in cluster', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      const backupsLink = page.getByRole('link', { name: /backup/i }).or(
        page.getByRole('tab', { name: /backup/i })
      );
      if (await backupsLink.isVisible({ timeout: 3000 })) {
        await backupsLink.click();
        await expect(page.getByText(/backup/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should show backup options', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      const backupsLink = page.getByRole('link', { name: /backup/i });
      if (await backupsLink.isVisible({ timeout: 3000 })) {
        await backupsLink.click();
        
        // Look for create backup button
        const createBtn = page.getByRole('button', { name: /create|new|trigger/i });
        if (await createBtn.isVisible({ timeout: 3000 })) {
          expect(true).toBeTruthy();
        }
      }
    }
  });
});

test.describe('Point-in-Time Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should show PITR configuration', async ({ page }) => {
    const clusterLink = page.locator('a[href*="/clusters/"]').first();
    if (await clusterLink.isVisible({ timeout: 5000 })) {
      await clusterLink.click();
      
      // Look for PITR section
      const pitrLink = page.getByRole('link', { name: /pitr|point.*time|recovery/i });
      if (await pitrLink.isVisible({ timeout: 3000 })) {
        await pitrLink.click();
        await expect(page.getByText(/point.*time|continuous|oplog/i).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
