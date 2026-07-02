import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

test.describe('Smoke Tests', () => {
  test('home page loads with title', async ({ page }) => {
    await page.goto(TEST_URL);
    await expect(page.locator('nav h1')).toBeVisible();
    await expect(page).toHaveTitle(/SecureAgentBase|Your App/);
  });

  test('About page content is correct', async ({ page }) => {
    await page.goto(`${TEST_URL}/about`);
    await expect(page.getByRole('heading', { name: 'About SecureAgentBase' })).toBeVisible();
    await expect(page.getByText('React 19 with Vite')).toBeVisible();
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto(`${TEST_URL}/login`);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('signup page is accessible', async ({ page }) => {
    await page.goto(`${TEST_URL}/signup`);
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel(/^Password$/)).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
  });

  test('unknown route does not crash', async ({ page }) => {
    await page.goto(`${TEST_URL}/nonexistent-page-xyz`);
    // No matching route — page should not crash
    await expect(page.locator('body')).toBeAttached();
  });
});
