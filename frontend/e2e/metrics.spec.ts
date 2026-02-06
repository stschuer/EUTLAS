import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

test.describe('Metrics & Monitoring', () => {
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

  test('should navigate to metrics page', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/metrics`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('should display metric charts or chart placeholders', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/metrics`);
    await page.waitForLoadState('networkidle');

    // Should see charts, canvas elements, or SVG charts
    const charts = page.locator('canvas, svg.recharts-surface, [data-testid*="chart"], .chart');
    const chartLabels = page.locator('text=CPU, text=Memory, text=Storage, text=Connections, text=Operations');

    const hasMetricsContent = (await charts.count()) > 0 || (await chartLabels.count()) > 0;
    expect(hasMetricsContent).toBe(true);
  });

  test('should have time range selector', async ({ page }) => {
    test.skip(!clusterId, 'No cluster available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}/metrics`);
    await page.waitForLoadState('networkidle');

    // Should have time range selection (1h, 6h, 24h, 7d, 30d)
    const timeRange = page.locator(
      'button:has-text("1h"), button:has-text("6h"), button:has-text("24h"), button:has-text("7d"), select, [role="combobox"]'
    );

    expect(await timeRange.count()).toBeGreaterThan(0);
  });
});
