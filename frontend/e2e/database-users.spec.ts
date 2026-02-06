import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Database Users', () => {
  let orgId: string;
  let projectId: string;
  let clusterId: string;

  test.beforeAll(async ({ request }) => {
    // Setup test data via API
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    const { accessToken } = (await loginRes.json()).data;

    // Get or create org
    const orgsRes = await request.get(`${API_URL}/orgs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const orgs = (await orgsRes.json()).data;

    if (orgs.length > 0) {
      orgId = orgs[0].id;
    } else {
      const orgRes = await request.post(`${API_URL}/orgs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'E2E Test Org' },
      });
      orgId = (await orgRes.json()).data.id;
    }

    // Get or create project
    const projectsRes = await request.get(`${API_URL}/orgs/${orgId}/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await projectsRes.json()).data;

    if (projects.length > 0) {
      projectId = projects[0].id;
    } else {
      const projRes = await request.post(`${API_URL}/orgs/${orgId}/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'E2E Test Project' },
      });
      projectId = (await projRes.json()).data.id;
    }

    // Get or create cluster
    const clustersRes = await request.get(`${API_URL}/projects/${projectId}/clusters`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const clusters = (await clustersRes.json()).data;

    if (clusters.length > 0) {
      clusterId = clusters[0].id;
    } else {
      const clusterRes = await request.post(`${API_URL}/projects/${projectId}/clusters`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'e2e-test-cluster', plan: 'DEV' },
      });
      clusterId = (await clusterRes.json()).data.id;
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to database users page', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/database-users`);
    await page.waitForLoadState('networkidle');

    // Should see database users page content
    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display database users list or empty state', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/database-users`);
    await page.waitForLoadState('networkidle');

    // Should see either a list of users or empty state
    const userList = page.locator('table, [role="grid"], [data-testid="users-list"]');
    const emptyState = page.locator('text=No database users, text=Create your first, text=Add User');
    const createButton = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")');

    const hasContent = (await userList.count()) > 0 ||
                       (await emptyState.count()) > 0 ||
                       (await createButton.count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('should show create user button', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/database-users`);
    await page.waitForLoadState('networkidle');

    const createButton = page.locator(
      'button:has-text("Create"), button:has-text("Add User"), button:has-text("New User")'
    );
    expect(await createButton.count()).toBeGreaterThan(0);
  });
});
