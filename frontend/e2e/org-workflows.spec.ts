import { test, expect, loginUser, TEST_USER, API_URL } from './fixtures/test-fixtures';

/**
 * Tests for organization and project CRUD workflows
 * that were previously only tested with soft/vacuous assertions.
 */

test.describe('Organization Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to create org page', async ({ page }) => {
    await page.goto('/dashboard/orgs/new');
    await page.waitForLoadState('networkidle');

    // Should see create org form
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input#name');
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")');

    expect(await nameInput.count()).toBeGreaterThan(0);
    expect(await submitButton.count()).toBeGreaterThan(0);
  });

  test('should create a new organization', async ({ page }) => {
    await page.goto('/dashboard/orgs/new');
    await page.waitForLoadState('networkidle');

    const orgName = `E2E Test Org ${Date.now()}`;
    
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input#name').first();
    await nameInput.fill(orgName);

    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    await submitButton.click();

    // Should redirect to the new org page
    await page.waitForURL(/dashboard\/orgs\/[a-f0-9]+/, { timeout: 10000 });
    expect(page.url()).toMatch(/dashboard\/orgs\/[a-f0-9]+/);
  });

  test('should display org overview page', async ({ page }) => {
    // First get an org ID
    const loginRes = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    const { accessToken } = (await loginRes.json()).data;

    const orgsRes = await page.request.get(`${API_URL}/orgs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const orgs = (await orgsRes.json()).data;
    
    test.skip(orgs.length === 0, 'No orgs available');

    await page.goto(`/dashboard/orgs/${orgs[0].id}`);
    await page.waitForLoadState('networkidle');

    // Should see org content with navigation to sub-pages
    const orgNav = page.locator(
      'a[href*="projects"], a[href*="team"], a[href*="billing"], a[href*="alerts"]'
    );
    expect(await orgNav.count()).toBeGreaterThan(0);
  });

  test('should list organizations on orgs page', async ({ page }) => {
    await page.goto('/dashboard/orgs');
    await page.waitForLoadState('networkidle');

    // Should see org list
    const orgLinks = page.locator('a[href*="/orgs/"]');
    expect(await orgLinks.count()).toBeGreaterThan(0);
  });
});

test.describe('Project Workflows', () => {
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

  test('should navigate to create project page', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/new`);
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input#name');
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")');

    expect(await nameInput.count()).toBeGreaterThan(0);
    expect(await submitButton.count()).toBeGreaterThan(0);
  });

  test('should create a new project', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/new`);
    await page.waitForLoadState('networkidle');

    const projectName = `E2E Test Project ${Date.now()}`;
    
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input#name').first();
    await nameInput.fill(projectName);

    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    await submitButton.click();

    // Should redirect to the project or projects list
    await page.waitForURL(/projects/, { timeout: 10000 });
  });

  test('should list projects in org', async ({ page }) => {
    test.skip(!orgId, 'No org available');

    await page.goto(`/dashboard/orgs/${orgId}/projects`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible();

    // Should see projects or create button
    const projectLinks = page.locator('a[href*="/projects/"]');
    const createButton = page.locator('button:has-text("Create"), button:has-text("New")');

    expect((await projectLinks.count()) > 0 || (await createButton.count()) > 0).toBe(true);
  });
});

test.describe('Cluster Workflows', () => {
  let orgId: string;
  let projectId: string;

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
  });

  test.beforeEach(async ({ page }) => {
    await loginUser(page);
  });

  test('should navigate to create cluster page', async ({ page }) => {
    test.skip(!projectId, 'No project available');

    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/new`);
    await page.waitForLoadState('networkidle');

    // Should see cluster creation form
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input#name');
    const planSelector = page.locator('select, [role="combobox"], [role="radiogroup"], button:has-text("DEV")');

    expect(await nameInput.count()).toBeGreaterThan(0);
  });

  test('should display cluster detail page', async ({ page, request }) => {
    test.skip(!projectId, 'No project available');

    // Get a cluster via API
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    const { accessToken } = (await loginRes.json()).data;

    const clustersRes = await request.get(`${API_URL}/projects/${projectId}/clusters`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const clusters = (await clustersRes.json()).data;
    test.skip(clusters.length === 0, 'No clusters available');

    const clusterId = clusters[0].id;
    await page.goto(`/dashboard/orgs/${orgId}/projects/${projectId}/clusters/${clusterId}`);
    await page.waitForLoadState('networkidle');

    // Should see cluster overview with status and details
    const clusterContent = page.locator(
      'text=Status, text=Plan, text=Region, text=MongoDB, text=Connection'
    );
    expect(await clusterContent.count()).toBeGreaterThan(0);
  });
});
