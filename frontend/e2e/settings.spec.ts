import { test, expect, loginUser } from './fixtures/test-fixtures';

test.describe('User Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display user profile section', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // Should see profile fields
    const profileFields = page.locator(
      'text=Name, text=Email, text=Profile, text=Account'
    );
    expect(await profileFields.count()).toBeGreaterThan(0);
  });

  test('should have editable profile fields', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // Should have input fields for profile info
    const inputs = page.locator('input[type="text"], input[type="email"], input[name*="name"]');
    expect(await inputs.count()).toBeGreaterThan(0);
  });

  test('should have save/update button', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    const saveButton = page.locator(
      'button:has-text("Save"), button:has-text("Update"), button[type="submit"]'
    );
    expect(await saveButton.count()).toBeGreaterThan(0);
  });

  test('should have password change section', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    const passwordSection = page.locator(
      'text=Password, text=Change Password, text=Security, input[type="password"]'
    );
    expect(await passwordSection.count()).toBeGreaterThan(0);
  });
});
