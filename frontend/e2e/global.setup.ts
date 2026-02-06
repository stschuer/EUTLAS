import { test as setup, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

/**
 * Global setup - ensures test user exists and API is healthy
 */
setup('verify API health', async ({ request }) => {
  // Check API health
  const healthResponse = await request.get(`${API_URL}/health`);
  expect(healthResponse.ok()).toBeTruthy();
  
  const health = await healthResponse.json();
  expect(health.status).toBe('ok');
  
  console.log('✅ API is healthy');
});

setup('create test user if needed', async ({ request }) => {
  const testEmail = 'playwright-test@example.com';
  const testPassword = 'PlaywrightTest123!';
  
  // Try to login first
  const loginResponse = await request.post(`${API_URL}/auth/login`, {
    data: {
      email: testEmail,
      password: testPassword,
    },
  });
  
  if (loginResponse.ok()) {
    console.log('✅ Test user already exists');
  } else {
    // Create test user
    const signupResponse = await request.post(`${API_URL}/auth/signup`, {
      data: {
        email: testEmail,
        password: testPassword,
        firstName: 'Playwright',
        lastName: 'Test User',
      },
    });
    
    if (signupResponse.ok() || signupResponse.status() === 409) {
      console.log('✅ Test user ready');
    } else {
      console.log('⚠️ Could not create test user:', await signupResponse.text());
    }
  }

  // Ensure at least one org exists for the test user
  const authResponse = await request.post(`${API_URL}/auth/login`, {
    data: { email: testEmail, password: testPassword },
  });

  if (authResponse.ok()) {
    const { accessToken } = (await authResponse.json()).data;
    
    const orgsResponse = await request.get(`${API_URL}/orgs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (orgsResponse.ok()) {
      const orgs = (await orgsResponse.json()).data;
      if (orgs.length === 0) {
        const createOrgRes = await request.post(`${API_URL}/orgs`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'E2E Test Org' },
        });
        if (createOrgRes.ok()) {
          const org = (await createOrgRes.json()).data;
          console.log('✅ Test org created:', org.id);

          // Also create a test project
          const createProjRes = await request.post(`${API_URL}/orgs/${org.id}/projects`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: { name: 'E2E Test Project' },
          });
          if (createProjRes.ok()) {
            console.log('✅ Test project created');
          }
        }
      } else {
        console.log('✅ Test org already exists:', orgs[0].id);
      }
    }
  }
});





