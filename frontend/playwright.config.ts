import { defineConfig, devices } from '@playwright/test';

/**
 * EUTLAS Frontend E2E Test Configuration
 * 
 * Run all tests: pnpm test:e2e
 * Run headed: pnpm test:e2e --headed
 * Run specific test: pnpm test:e2e auth.spec.ts
 */
export default defineConfig({
  testDir: './e2e',
  
  // Run tests in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Parallel workers
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    
    // API URL for backend calls
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
    
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
    
    // Capture trace on failure
    trace: 'on-first-retry',
    
    // Video on failure
    video: 'on-first-retry',
  },

  // Configure projects for browsers
  projects: [
    // Setup project - runs before all tests
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    
    // Desktop Chrome
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },
    
    // Desktop Firefox (optional)
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    //   dependencies: ['setup'],
    // },

    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],

  // Web server configuration
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
  
  // Global timeout
  timeout: 30000,
  
  // Expect timeout
  expect: {
    timeout: 5000,
  },
});




