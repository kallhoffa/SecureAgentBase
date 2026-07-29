import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';
const E2E_USER = {
  email: process.env.E2E_TEST_EMAIL || 'e2e@agentbase-staging.iam.gserviceaccount.com',
  password: process.env.E2E_TEST_PASSWORD || '',
};

const signIn = async (page) => {
  if (!E2E_USER.password) return;
  if (process.env.E2E_FIREBASE_API_KEY) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.E2E_FIREBASE_API_KEY}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: E2E_USER.email,
        password: E2E_USER.password,
        returnSecureToken: true,
      }),
    }).catch(() => {});
  }
  await page.goto(`${TEST_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', E2E_USER.email);
  await page.fill('input[type="password"]', E2E_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
};

test.describe('Smoke Tests', () => {
  test('home page loads with title', async ({ page }) => {
    await signIn(page);
    await page.goto(TEST_URL);
    await expect(page.locator('nav h1')).toBeVisible();
    await expect(page).toHaveTitle(/SecureAgentBase|Your App/);
  });

  test('About page content is correct', async ({ page }) => {
    await signIn(page);
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
    await signIn(page);
    await page.goto(`${TEST_URL}/nonexistent-page-xyz`);
    await expect(page.locator('body')).toBeAttached();
  });
});
