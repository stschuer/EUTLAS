import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display landing page', async ({ page }) => {
    await page.goto('/');
    
    // Should show main heading
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('should have login link', async ({ page }) => {
    await page.goto('/');
    
    const loginLink = page.getByRole('link', { name: /login|sign in/i });
    await expect(loginLink).toBeVisible();
  });

  test('should have signup link', async ({ page }) => {
    await page.goto('/');
    
    const signupLink = page.getByRole('link', { name: /sign up|get started|register/i });
    await expect(signupLink).toBeVisible();
  });

  test('should navigate to login from landing', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/login/);
  });

  test('should navigate to signup from landing', async ({ page }) => {
    await page.goto('/');
    
    const signupLink = page.getByRole('link', { name: /sign up|get started|register/i });
    await signupLink.click();
    await expect(page).toHaveURL(/signup/);
  });

  test('should display features section', async ({ page }) => {
    await page.goto('/');
    
    // Look for features content
    const features = page.getByText(/feature|mongodb|database|cloud/i);
    await expect(features.first()).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    await page.goto('/');
    
    // Test different viewports
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
    
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();
    
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('SEO and Accessibility', () => {
  test('should have proper page title', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/.+/);
  });

  test('should have meta description', async ({ page }) => {
    await page.goto('/');
    
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    
    // Should have an h1
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
  });

  test('should have accessible images', async ({ page }) => {
    await page.goto('/');
    
    // All images should have alt text
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const ariaHidden = await img.getAttribute('aria-hidden');
      
      // Image should have alt, aria-label, or be hidden
      expect(alt || ariaLabel || ariaHidden === 'true').toBeTruthy();
    }
  });
});



