import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

test.describe('Navigation', () => {
  test('nav bar shows app name and key links', async ({ page }) => {
    await page.goto(TEST_URL);
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('h1')).toBeVisible();
    await expect(nav.getByText('About')).toBeVisible();
  });

  test('nav brand links to home', async ({ page }) => {
    await page.goto(`${TEST_URL}/about`);
    await page.locator('nav a[href="/"]').first().click();
    await expect(page).toHaveURL(TEST_URL + '/');
  });

  test('About link navigates to /about', async ({ page }) => {
    await page.goto(TEST_URL);
    await page.getByText('About').first().click();
    await expect(page).toHaveURL(/\/about/);
  });

  test('Sign In button navigates to /login', async ({ page }) => {
    await page.goto(TEST_URL);
    const signInBtn = page.locator('nav').getByRole('button', { name: 'Sign In' });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
