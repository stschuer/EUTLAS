import { test, expect } from '@playwright/test';

// Selectors for our specific UI
const selectors = {
  emailInput: 'input#email, input[name="email"], input[type="email"]',
  passwordInput: 'input#password, input[name="password"], input[type="password"]',
  submitButton: 'button[type="submit"]',
};

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');
      
      // Check form elements exist
      await expect(page.locator(selectors.emailInput)).toBeVisible();
      await expect(page.locator(selectors.passwordInput)).toBeVisible();
      await expect(page.locator(selectors.submitButton)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');
      
      // Fill with invalid credentials
      await page.locator(selectors.emailInput).fill('invalid@example.com');
      await page.locator(selectors.passwordInput).fill('wrongpassword');
      await page.locator(selectors.submitButton).click();
      
      // Should show error message (toast or form error)
      await expect(page.getByText(/invalid|error|incorrect|failed/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto('/login');
      
      // Fill with valid credentials
      await page.locator(selectors.emailInput).fill('playwright-test@example.com');
      await page.locator(selectors.passwordInput).fill('PlaywrightTest123!');
      await page.locator(selectors.submitButton).click();
      
      // Should redirect to dashboard
      await page.waitForURL(/dashboard/, { timeout: 15000 });
      await expect(page).toHaveURL(/dashboard/);
    });

    test('should have link to signup page', async ({ page }) => {
      await page.goto('/login');
      
      const signupLink = page.getByRole('link', { name: /sign up/i });
      await expect(signupLink).toBeVisible();
    });

    test('should have link to forgot password', async ({ page }) => {
      await page.goto('/login');
      
      const forgotLink = page.getByRole('link', { name: /forgot/i });
      await expect(forgotLink).toBeVisible();
    });

    test('should navigate to signup from login', async ({ page }) => {
      await page.goto('/login');
      
      await page.getByRole('link', { name: /sign up/i }).click();
      await expect(page).toHaveURL(/signup/);
    });
  });

  test.describe('Signup Page', () => {
    test('should display signup form', async ({ page }) => {
      await page.goto('/signup');
      
      // Check form elements
      await expect(page.locator(selectors.emailInput)).toBeVisible();
      await expect(page.locator(selectors.passwordInput).first()).toBeVisible();
      await expect(page.locator(selectors.submitButton)).toBeVisible();
    });

    test('should have link to login page', async ({ page }) => {
      await page.goto('/signup');
      
      const loginLink = page.getByRole('link', { name: /sign in|log in/i });
      await expect(loginLink).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
      // Clear any existing auth
      await page.goto('/login');
      await page.evaluate(() => localStorage.clear());
      
      await page.goto('/dashboard');
      
      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });
  });

  test.describe('Session', () => {
    test('should persist login after page refresh', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.locator(selectors.emailInput).fill('playwright-test@example.com');
      await page.locator(selectors.passwordInput).fill('PlaywrightTest123!');
      await page.locator(selectors.submitButton).click();
      await page.waitForURL(/dashboard/, { timeout: 15000 });
      
      // Refresh the page
      await page.reload();
      
      // Should still be on dashboard
      await expect(page).toHaveURL(/dashboard/);
    });
  });
});
