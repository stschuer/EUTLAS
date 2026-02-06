import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Activity Feed', () => {
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

  test('should navigate to activity feed', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/activity`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display activity entries', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/activity`);
    await page.waitForLoadState('networkidle');

    // Should see activity items or empty state
    const activityList = page.locator('[data-testid="activity-feed"], .activity-feed, [role="feed"]');
    const activityItems = page.locator('text=created, text=updated, text=deployed, text=logged in');
    const emptyState = page.locator('text=No activity, text=No events, text=No recent');

    const hasContent = (await activityList.count()) > 0 ||
                       (await activityItems.count()) > 0 ||
                       (await emptyState.count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('should have severity or type filters', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/activity`);
    await page.waitForLoadState('networkidle');

    const filters = page.locator(
      'button:has-text("Filter"), select, [role="combobox"], [data-testid*="filter"]'
    );

    expect(await filters.count()).toBeGreaterThan(0);
  });
});
