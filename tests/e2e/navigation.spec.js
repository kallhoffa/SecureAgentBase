import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

// The top navigation bar is the only <nav> containing the app-name <h1> —
// the page footer also contains a legal-links <nav>, so scope by content.
const topNav = (page) =>
  page.getByRole('navigation').filter({ has: page.locator('h1') });

test.describe('Navigation', () => {
  test('nav bar shows app name and key links', async ({ page }) => {
    await page.goto(TEST_URL);
    const nav = topNav(page);
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
    const signInBtn = topNav(page).getByRole('button', { name: 'Sign In' });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('footer shows privacy and terms links', async ({ page }) => {
    await page.goto(TEST_URL);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByText('Privacy Policy')).toBeVisible();
    await expect(footer.getByText('Terms of Service')).toBeVisible();
  });

  test('privacy and terms pages render', async ({ page }) => {
    await page.goto(`${TEST_URL}/privacy`);
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();
    await expect(page.getByText(/limited use/i).first()).toBeVisible();
    await page.goto(`${TEST_URL}/terms`);
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible();
    await expect(page.getByText(/governing law/i).first()).toBeVisible();
  });
});
