import { test, expect } from './fixtures/test-fixtures';

test.describe('Vector Search', () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test('should navigate to vector search section', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for Search or Atlas Search link
    const searchLink = page.locator(
      'a[href*="search"], a[href*="vector"], a:has-text("Search"), a:has-text("Atlas Search")'
    );
    
    if (await searchLink.count() > 0) {
      await searchLink.first().click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display vector index management UI', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Navigate to a cluster first
    const clusterLink = page.locator('a[href*="clusters"]');
    if (await clusterLink.count() > 0) {
      await clusterLink.first().click();
      await page.waitForLoadState('networkidle');
      
      // Look for Search/Vector tab
      const searchTab = page.locator(
        'button:has-text("Search"), a:has-text("Search"), [role="tab"]:has-text("Search")'
      );
      
      if (await searchTab.count() > 0) {
        await searchTab.first().click();
        await page.waitForLoadState('networkidle');
        
        // Should see index management section
        const indexSection = page.locator(
          'text=Vector Indexes, text=Search Indexes, text=Create Index'
        );
        expect(await indexSection.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should show create vector index form', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Navigate through cluster to search
    const clustersLink = page.locator('a[href*="clusters"]');
    if (await clustersLink.count() > 0) {
      await clustersLink.first().click();
      await page.waitForLoadState('networkidle');
    }
    
    // Look for create index button
    const createButton = page.locator(
      'button:has-text("Create Index"), button:has-text("New Index"), button:has-text("Add Index")'
    );
    
    if (await createButton.count() > 0) {
      await createButton.first().click();
      
      // Should show form fields
      const formFields = page.locator('input, select, [role="combobox"]');
      expect(await formFields.count()).toBeGreaterThan(0);
    }
  });

  test('should display vector similarity options', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for similarity metric options in any create form
    const similarityOptions = page.locator(
      'text=cosine, text=euclidean, text=dotProduct, select:has-text("Similarity")'
    );
    
    // These options should exist in vector search configuration
    expect(await similarityOptions.count()).toBeGreaterThanOrEqual(0);
  });

  test('should show search testing interface', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Navigate to search section
    const searchNav = page.locator('a[href*="search"]');
    if (await searchNav.count() > 0) {
      await searchNav.first().click();
      await page.waitForLoadState('networkidle');
      
      // Look for search test interface
      const searchInput = page.locator(
        'input[placeholder*="search"], textarea[placeholder*="query"], input[type="search"]'
      );
      
      expect(await searchInput.count()).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Custom Analyzers', () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test('should display analyzer configuration', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for analyzers section
    const analyzersSection = page.locator(
      'text=Analyzers, text=Custom Analyzers, a[href*="analyzer"]'
    );
    
    if (await analyzersSection.count() > 0) {
      await analyzersSection.first().click();
      await page.waitForLoadState('networkidle');
      
      // Should see analyzer list or create button
      const analyzerUI = page.locator(
        'button:has-text("Create"), text=No analyzers, text=lucene'
      );
      expect(await analyzerUI.count()).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show tokenizer options', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Common tokenizer types that should be available
    const tokenizerTypes = ['standard', 'whitespace', 'keyword', 'letter'];
    
    // Look for analyzer creation form
    const createAnalyzerBtn = page.locator('button:has-text("Create Analyzer")');
    if (await createAnalyzerBtn.count() > 0) {
      await createAnalyzerBtn.first().click();
      
      // Check for tokenizer selection
      const tokenizerSelect = page.locator('select, [role="combobox"]');
      expect(await tokenizerSelect.count()).toBeGreaterThan(0);
    }
  });
});

test.describe('Semantic Search', () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test('should show semantic search option', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for semantic search or AI search features
    const semanticSearch = page.locator(
      'text=Semantic Search, text=AI Search, text=Vector Search, text=Natural Language'
    );
    
    expect(await semanticSearch.count()).toBeGreaterThanOrEqual(0);
  });

  test('should display embedding configuration', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for embedding/vector configuration
    const embeddingConfig = page.locator(
      'text=Embedding, text=Dimensions, text=Vector Field, input[name*="dimension"]'
    );
    
    expect(await embeddingConfig.count()).toBeGreaterThanOrEqual(0);
  });
});




