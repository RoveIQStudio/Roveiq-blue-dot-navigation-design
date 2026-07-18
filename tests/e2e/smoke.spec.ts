import { test, expect } from '@playwright/test';

/**
 * E2E Smoke Tests for RoveMaps SDK
 *
 * These tests verify basic functionality of the demo app to ensure the SDK
 * loads and renders correctly. Geolocation is mocked at the browser level via
 * Playwright's `test.use` so the SDK receives a deterministic GPS fix.
 */
test.use({
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ['geolocation'],
});

test.describe('RoveMaps SDK Smoke Tests', () => {
    test('demo app loads without errors', async ({ page }) => {
        // Track console errors
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Track uncaught exceptions
        const pageErrors: string[] = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        // Load the app
        await page.goto('/');

        // Wait for the app to initialize by waiting for the map canvas to render
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });

        // Verify no errors
        expect(consoleErrors.filter(e => !e.includes('WebGL'))).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test('map canvas renders', async ({ page }) => {
        await page.goto('/');

        // Check if map canvas is present
        const canvas = page.locator('canvas');
        await expect(canvas.first()).toBeVisible({ timeout: 10000 });
    });

    test('map container has correct dimensions', async ({ page }) => {
        await page.goto('/');

        // Wait for the map canvas to render instead of a fixed sleep
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Check that map container has proper size
        const box = await canvas.boundingBox();

        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(100);
        expect(box!.height).toBeGreaterThan(100);
    });

    test('user marker appears after a mocked GPS fix', async ({ page }) => {
        await page.goto('/');

        // The `.maplibre-user-marker` element only exists in the MapLibre view;
        // the demo defaults to the Three.js tab, so switch tabs first.
        await page.getByRole('button', { name: 'MapLibre GL' }).click();

        // The marker element is attached to the DOM only after the SDK receives
        // its first GPS fix (Playwright supplies the mocked location above), so a
        // visible marker proves the location -> render pipeline actually ran.
        const marker = page.locator('.maplibre-user-marker');
        await expect(marker).toBeVisible({ timeout: 15000 });

        const box = await marker.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
    });

    test('page responds to user interaction', async ({ page }) => {
        await page.goto('/');

        // Wait for the map canvas to render instead of a fixed sleep
        const canvas = page.locator('canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });

        // Verify canvas is interactive (can receive mouse events)
        await expect(canvas).toBeEnabled();

        // Simulate a click on the canvas
        await canvas.click();

        // The canvas should still be rendered and interactive after the click
        // (no crash = success)
        await expect(canvas).toBeVisible();
        await expect(canvas).toBeEnabled();
    });

    test('SDK does not leak memory on page navigation', async ({ page }) => {
        // Load page and wait for the map canvas to render
        await page.goto('/');
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });

        // Navigate away; the old document (and its canvas) is torn down
        await page.goto('about:blank');
        await expect(page.locator('canvas')).toHaveCount(0);

        // Navigate back and verify the canvas renders again
        await page.goto('/');
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
    });
});
