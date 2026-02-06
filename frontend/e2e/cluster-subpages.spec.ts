import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

/**
 * Tests for cluster sub-pages that had zero coverage:
 * - archive, maintenance, scaling, schemas, settings
 */

test.describe('Cluster Sub-Pages', () => {
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

  const clusterPath = () =>
    `/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}`;

  // ==================== Cluster Settings ====================

  test.describe('Cluster Settings', () => {
    test('should navigate to cluster settings page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/settings`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should display cluster configuration options', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/settings`);
      await page.waitForLoadState('networkidle');

      const settingsContent = page.locator(
        'text=Settings, text=Configuration, text=Tags, text=Labels, text=Connection'
      );
      expect(await settingsContent.count()).toBeGreaterThan(0);
    });
  });

  // ==================== Scaling ====================

  test.describe('Cluster Scaling', () => {
    test('should navigate to scaling page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/scaling`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should display scaling recommendations or auto-scaling config', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/scaling`);
      await page.waitForLoadState('networkidle');

      const scalingContent = page.locator(
        'text=Scaling, text=Auto-Scaling, text=Recommendations, text=Scale Up, text=Scale Down, text=Current Plan'
      );
      expect(await scalingContent.count()).toBeGreaterThan(0);
    });
  });

  // ==================== Schemas ====================

  test.describe('Schema Validation', () => {
    test('should navigate to schemas page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/schemas`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should show create schema option', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/schemas`);
      await page.waitForLoadState('networkidle');

      const createButton = page.locator(
        'button:has-text("Create"), button:has-text("Add"), button:has-text("New")'
      );
      const emptyState = page.locator('text=No schemas, text=Create your first');

      expect((await createButton.count()) > 0 || (await emptyState.count()) > 0).toBe(true);
    });
  });

  // ==================== Maintenance ====================

  test.describe('Maintenance Windows', () => {
    test('should navigate to maintenance page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/maintenance`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should display maintenance windows or schedule option', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/maintenance`);
      await page.waitForLoadState('networkidle');

      const maintenanceContent = page.locator(
        'text=Maintenance, text=Schedule, text=Window, text=Upcoming, button:has-text("Schedule")'
      );
      expect(await maintenanceContent.count()).toBeGreaterThan(0);
    });
  });

  // ==================== Online Archive ====================

  test.describe('Online Archive', () => {
    test('should navigate to archive page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/archive`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should display archive rules or create option', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/archive`);
      await page.waitForLoadState('networkidle');

      const archiveContent = page.locator(
        'text=Archive, text=Rules, text=Create Rule, button:has-text("Create"), text=No archive'
      );
      expect(await archiveContent.count()).toBeGreaterThan(0);
    });
  });

  // ==================== Search Indexes ====================

  test.describe('Search Indexes', () => {
    test('should navigate to search indexes page', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/search-indexes`);
      await page.waitForLoadState('networkidle');

      const heading = page.locator('h1, h2, [role="heading"]').first();
      await expect(heading).toBeVisible();
    });

    test('should show create index option', async ({ page }) => {
      test.skip(!clusterId, 'No cluster available');

      await page.goto(`${clusterPath()}/search-indexes`);
      await page.waitForLoadState('networkidle');

      const createButton = page.locator(
        'button:has-text("Create"), button:has-text("New Index"), button:has-text("Add")'
      );
      const emptyState = page.locator('text=No search indexes, text=Create your first');

      expect((await createButton.count()) > 0 || (await emptyState.count()) > 0).toBe(true);
    });
  });
});
