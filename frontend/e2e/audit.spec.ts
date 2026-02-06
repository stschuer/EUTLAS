import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Audit Log', () => {
  let orgId: string;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    const { accessToken } = (await loginRes.json()).data;

    const orgsRes = await request.get(`${API_URL}/orgs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const orgs = (await orgsRes.json()).data;
    if (orgs.length > 0) orgId = orgs[0].id;
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to audit log page', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/audit`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display audit log entries or empty state', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/audit`);
    await page.waitForLoadState('networkidle');

    const logTable = page.locator('table, [role="grid"], [data-testid="audit-log"]');
    const emptyState = page.locator('text=No audit, text=No activity, text=No events');
    const logEntries = page.locator('text=created, text=updated, text=deleted, text=login');

    const hasContent = (await logTable.count()) > 0 ||
                       (await emptyState.count()) > 0 ||
                       (await logEntries.count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('should have date filter controls', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/audit`);
    await page.waitForLoadState('networkidle');

    // Should have date or time range filter
    const filters = page.locator(
      'input[type="date"], button:has-text("Filter"), button:has-text("Date"), [data-testid*="filter"], select'
    );

    expect(await filters.count()).toBeGreaterThan(0);
  });

  test('should have export option', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/audit`);
    await page.waitForLoadState('networkidle');

    const exportButton = page.locator(
      'button:has-text("Export"), button:has-text("Download"), a:has-text("Export")'
    );

    expect(await exportButton.count()).toBeGreaterThan(0);
  });
});
