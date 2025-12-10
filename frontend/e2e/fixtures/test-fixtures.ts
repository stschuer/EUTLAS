import { test as base, expect, Page } from '@playwright/test';

// Test user credentials
export const TEST_USER = {
  email: 'playwright-test@example.com',
  password: 'PlaywrightTest123!',
  name: 'Playwright Test User',
};

// API URL
export const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

// Helper to login
export async function loginUser(page: Page, email: string = TEST_USER.email, password: string = TEST_USER.password) {
  await page.goto('/login');
  
  // Use more specific selectors
  await page.locator('input#email, input[name="email"], input[type="email"]').fill(email);
  await page.locator('input#password, input[name="password"], input[type="password"]').fill(password);
  
  // Submit
  await page.getByRole('button', { name: /sign in/i }).click();
  
  // Wait for redirect to dashboard
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

// Extended test fixture with authentication
export const test = base.extend<{
  authenticatedPage: Page;
  apiToken: string;
}>({
  // Authenticated page fixture
  authenticatedPage: async ({ page }, use) => {
    await loginUser(page);
    await use(page);
  },
  
  // API token fixture
  apiToken: async ({ request }, use) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
    });
    
    const data = await response.json();
    await use(data.data.accessToken);
  },
});

export { expect };

// Helper functions
export async function createOrganization(page: Page, name: string) {
  await page.goto('/dashboard/orgs');
  await page.getByRole('button', { name: /create|new/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('button', { name: /create/i }).click();
  await page.waitForURL(/dashboard\/orgs\/[a-f0-9]+/);
}

export async function createProject(page: Page, orgId: string, name: string) {
  await page.goto(`/dashboard/orgs/${orgId}/projects`);
  await page.getByRole('button', { name: /create|new/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('button', { name: /create/i }).click();
}

export async function waitForToast(page: Page, message?: string) {
  const toast = page.locator('[role="alert"], .toast, [data-sonner-toast]').first();
  await toast.waitFor({ state: 'visible', timeout: 5000 });
  if (message) {
    await expect(toast).toContainText(message);
  }
}

