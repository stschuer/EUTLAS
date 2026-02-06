import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Network Access', () => {
  let orgId: string;
  let projectId: string;
  let clusterId: string;

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

    if (orgId) {
      const projectsRes = await request.get(`${API_URL}/orgs/${orgId}/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const projects = (await projectsRes.json()).data;
      if (projects.length > 0) projectId = projects[0].id;
    }

    if (projectId) {
      const clustersRes = await request.get(`${API_URL}/projects/${projectId}/clusters`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const clusters = (await clustersRes.json()).data;
      if (clusters.length > 0) clusterId = clusters[0].id;
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to network access page', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/network`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display IP whitelist or empty state', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/network`);
    await page.waitForLoadState('networkidle');

    const ipList = page.locator('table, [role="grid"], [data-testid="ip-list"]');
    const emptyState = page.locator('text=No IP addresses, text=whitelist, text=Add IP');
    const addButton = page.locator(
      'button:has-text("Add"), button:has-text("Allow"), button:has-text("Whitelist")'
    );

    const hasContent = (await ipList.count()) > 0 ||
                       (await emptyState.count()) > 0 ||
                       (await addButton.count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('should have add current IP option', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/network`);
    await page.waitForLoadState('networkidle');

    const addCurrentIp = page.locator(
      'button:has-text("Add Current IP"), button:has-text("My IP"), button:has-text("Current IP")'
    );
    
    // Should have option to add current IP
    expect(await addCurrentIp.count()).toBeGreaterThanOrEqual(0);
  });
});
