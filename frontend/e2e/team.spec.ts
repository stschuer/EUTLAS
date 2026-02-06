import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Team Management', () => {
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

  test('should navigate to team page', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/team`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display team members list', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/team`);
    await page.waitForLoadState('networkidle');

    // Should see members table or list
    const membersList = page.locator('table, [role="grid"], [data-testid="members-list"]');
    const memberItems = page.locator('text=Owner, text=Admin, text=Member, text=Role');

    const hasMembers = (await membersList.count()) > 0 || (await memberItems.count()) > 0;
    expect(hasMembers).toBe(true);
  });

  test('should show invite button', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/team`);
    await page.waitForLoadState('networkidle');

    const inviteButton = page.locator(
      'button:has-text("Invite"), button:has-text("Add Member"), button:has-text("Add User")'
    );
    expect(await inviteButton.count()).toBeGreaterThan(0);
  });

  test('should display current user in members', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/team`);
    await page.waitForLoadState('networkidle');

    // Current user should be visible in the members list
    const currentUser = page.locator(`text=${TEST_USER.email}`);
    expect(await currentUser.count()).toBeGreaterThan(0);
  });
});
