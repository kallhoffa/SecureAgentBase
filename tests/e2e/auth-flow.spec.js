import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

test.describe('Auth Flow', () => {
  test.describe('Login page', () => {
    test('renders all form elements', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`);
      await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.locator('form').getByRole('button', { name: /^Sign In$/ })).toBeVisible();
      await expect(page.getByText('Sign in with Google')).toBeVisible();
    });

    test('shows error on invalid credentials submission', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`);
      await page.getByLabel('Email').fill('nonexistent@test.com');
      await page.getByLabel('Password').fill('wrongpassword');
      await page.locator('form').getByRole('button', { name: /^Sign In$/ }).click();

      // Firebase auth error should appear
      await expect(page.locator('.bg-red-100')).toBeVisible({ timeout: 10000 });
    });

    test('navigates to signup via link', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`);
      await page.getByRole('link', { name: 'Sign up' }).click();
      await expect(page).toHaveURL(/\/signup/);
      await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    });
  });

  test.describe('Signup page', () => {
    test('renders all form elements', async ({ page }) => {
      await page.goto(`${TEST_URL}/signup`);
      await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel(/^Password$/)).toBeVisible();
      await expect(page.getByLabel('Confirm Password')).toBeVisible();
      await expect(page.locator('form').getByRole('button', { name: /^Sign Up$/ })).toBeVisible();
    });

    test('shows password mismatch error before API call', async ({ page }) => {
      await page.goto(`${TEST_URL}/signup`);
      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel(/^Password$/).fill('password123');
      await page.getByLabel('Confirm Password').fill('differentpassword');
      await page.locator('form').getByRole('button', { name: /^Sign Up$/ }).click();

      // Client-side validation — no API call made
      await expect(page.getByText('Passwords do not match')).toBeVisible();
    });

    test('shows short password error before API call', async ({ page }) => {
      await page.goto(`${TEST_URL}/signup`);
      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel(/^Password$/).fill('ab');
      await page.getByLabel('Confirm Password').fill('ab');
      await page.locator('form').getByRole('button', { name: /^Sign Up$/ }).click();

      await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
    });
  });
});
