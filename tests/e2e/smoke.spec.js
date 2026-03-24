import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:5173';

test.describe('Smoke Tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto(TEST_URL);
    await expect(page.locator('text=SecureAgentBase')).toBeVisible();
  });

  test('navigation bar is visible', async ({ page }) => {
    await page.goto(TEST_URL);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('text=About')).toBeVisible();
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto(`${TEST_URL}/login`);
    await expect(page.locator('text=Sign In')).toBeVisible();
  });

  test('signup page is accessible', async ({ page }) => {
    await page.goto(`${TEST_URL}/signup`);
    await expect(page.locator('text=Create Account')).toBeVisible();
  });

  test('about page is accessible', async ({ page }) => {
    await page.goto(`${TEST_URL}/about`);
    await expect(page.locator('text=About SecureAgentBase')).toBeVisible();
  });
});
