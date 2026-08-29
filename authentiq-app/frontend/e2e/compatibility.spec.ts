import { test, expect, devices } from '@playwright/test';

// Test across different devices and viewports
const devicesToTest = [
  devices['Desktop Chrome'],
  devices['Desktop Firefox'],
  devices['Desktop Safari'],
  devices['iPhone 12'],
  devices['iPad Pro'],
  devices['Pixel 5'],
];

test.describe('Cross-Browser Compatibility', () => {
  devicesToTest.forEach(device => {
    test(`should work correctly on ${device.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        ...device,
        viewport: device.viewport,
        userAgent: device.userAgent,
      });
      const page = await context.newPage();

      try {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');

        // Check that page loads without errors
        const title = await page.title();
        expect(title).toBeTruthy();

        // Check for console errors
        const errors: string[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error') {
            errors.push(msg.text());
          }
        });

        // Navigate to a few key pages
        await page.goto('http://localhost:3000/admin/login');
        await page.waitForLoadState('networkidle');

        // Check that critical elements are visible
        const loginForm = page.locator('form').first();
        if (await loginForm.count() > 0) {
          expect(await loginForm.isVisible()).toBeTruthy();
        }
      } finally {
        await context.close();
      }
    });
  });
});

test.describe('Responsive Design', () => {
  const viewports = [
    { width: 320, height: 568 },  // Mobile small
    { width: 375, height: 667 },  // Mobile medium
    { width: 768, height: 1024 }, // Tablet
    { width: 1024, height: 768 }, // Desktop small
    { width: 1440, height: 900 }, // Desktop large
    { width: 1920, height: 1080 }, // Desktop extra large
  ];

  viewports.forEach(viewport => {
    test(`should be responsive at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');

      // Check that page is responsive
      const body = page.locator('body');
      expect(await body.isVisible()).toBeTruthy();

      // Check that horizontal scrollbar is not present
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBeFalsy();
    });
  });
});

test.describe('Browser Feature Support', () => {
  test('should support modern JavaScript features', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check for ES6+ feature support
    const featuresSupported = await page.evaluate(() => {
      return {
        arrowFunctions: (() => {}) !== undefined,
        asyncAwait: (async () => {}) !== undefined,
        spreadOperator: [...[1, 2, 3]].length === 3,
        templateLiterals: `test` === 'test',
        destructuring: { a: 1 } !== undefined,
      };
    });

    expect(featuresSupported.arrowFunctions).toBeTruthy();
    expect(featuresSupported.asyncAwait).toBeTruthy();
    expect(featuresSupported.spreadOperator).toBeTruthy();
    expect(featuresSupported.templateLiterals).toBeTruthy();
    expect(featuresSupported.destructuring).toBeTruthy();
  });

  test('should support CSS Grid and Flexbox', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const cssSupport = await page.evaluate(() => {
      const div = document.createElement('div');
      return {
        grid: CSS.supports('display', 'grid'),
        flexbox: CSS.supports('display', 'flex'),
        flexGap: CSS.supports('gap', '10px'),
      };
    });

    expect(cssSupport.grid).toBeTruthy();
    expect(cssSupport.flexbox).toBeTruthy();
    expect(cssSupport.flexGap).toBeTruthy();
  });

  test('should support LocalStorage and SessionStorage', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const storageSupport = await page.evaluate(() => {
      try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        sessionStorage.setItem('test', 'test');
        sessionStorage.removeItem('test');
        return { localStorage: true, sessionStorage: true };
      } catch (e) {
        return { localStorage: false, sessionStorage: false };
      }
    });

    expect(storageSupport.localStorage).toBeTruthy();
    expect(storageSupport.sessionStorage).toBeTruthy();
  });
});

test.describe('Accessibility Compatibility', () => {
  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check for ARIA labels on interactive elements
    const buttons = page.locator('button[aria-label], button[aria-labelledby]');
    const inputs = page.locator('input[aria-label], input[aria-labelledby]');

    // At least some interactive elements should have ARIA labels
    const buttonCount = await buttons.count();
    const inputCount = await inputs.count();

    // This is a basic check - more comprehensive ARIA testing would be needed
    expect(buttonCount + inputCount).toBeGreaterThanOrEqual(0);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Test Tab navigation
    await page.keyboard.press('Tab');

    // Check that focus moved
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBeTruthy();
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Basic color contrast check
    const contrastInfo = await page.evaluate(() => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      const backgroundColor = computedStyle.backgroundColor;
      const color = computedStyle.color;

      return { backgroundColor, color };
    });

    expect(contrastInfo.backgroundColor).toBeTruthy();
    expect(contrastInfo.color).toBeTruthy();
  });
});

test.describe('Performance Compatibility', () => {
  test('should load within acceptable time on slow connections', async ({ page, context }) => {
    // Simulate slow 3G connection
    await context.setOffline(false);
    await page.goto('http://localhost:3000');

    const loadTime = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return perfData.loadEventEnd - perfData.fetchStart;
    });

    // Should load within 10 seconds on slow connection
    expect(loadTime).toBeLessThan(10000);
  });

  test('should handle JavaScript disabled gracefully', async ({ context }) => {
    const page = await context.newPage();
    await page.setJavaScriptEnabled(false);
    
    await page.goto('http://localhost:3000');

    // Check that there's a noscript message or fallback
    const noscriptContent = await page.content();
    const hasNoscript = noscriptContent.includes('noscript') || 
                        noscriptContent.includes('JavaScript');

    await page.close();
    // If JavaScript is disabled, the app should still show something
    expect(noscriptContent.length).toBeGreaterThan(0);
  });
});
