import { test, expect } from '@playwright/test';
const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

test.describe('Template Preview', () => {
  test('preview shows welcome heading', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    const heading = page.getByRole('heading', { name: /Welcome to/ });
    await expect(heading).toBeVisible();
  });

  test('preview shows app name', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await expect(page.getByRole('heading', { name: /Welcome to/ })).toContainText(/SecureAgentBase|Your App/);
  });

  test('description text is present', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await expect(page.getByText(/hardened React \+ Firebase template/)).toBeVisible();
  });

  test('quick link buttons are rendered', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await expect(page.getByText('Tasks').first()).toBeVisible();
    await expect(page.getByText('About').first()).toBeVisible();
    await expect(page.getByText('Profile').first()).toBeVisible();
    await expect(page.getByText('Security').first()).toBeVisible();
  });

  test('Tasks quick link button navigates away from preview', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.locator('button').filter({ hasText: 'Tasks' }).click();
    // Tasks is behind RequireAuth, so it redirects to /login
    // Verify we left the preview page
    await expect(page).not.toHaveURL(/\/preview/);
  });

  test('About quick link navigates to /about', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByText('About').first().click();
    await expect(page).toHaveURL(/\/about/);
  });

  test('shows sign in and create account buttons when logged out', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await expect(page.getByRole('button', { name: 'Sign In' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' }).first()).toBeVisible();
  });

  test('Sign In button navigates to /login', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Create Account button navigates to /signup', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByRole('button', { name: 'Create Account' }).first().click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('Template Tasks Page', () => {
  test('tasks page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(`${TEST_URL}/tasks`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('tasks page shows sign-in heading when not authenticated', async ({ page }) => {
    await page.goto(`${TEST_URL}/tasks`);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });
});
