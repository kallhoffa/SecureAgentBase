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
    await expect(page.getByText('Tasks')).toBeVisible();
    await expect(page.getByText('About')).toBeVisible();
    await expect(page.getByText('Profile')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();
  });

  test('Tasks quick link navigates to /tasks', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByText('Tasks').first().click();
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('About quick link navigates to /about', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByText('About').first().click();
    await expect(page).toHaveURL(/\/about/);
  });

  test('shows sign in and create account buttons when logged out', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('Sign In button navigates to /login', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Create Account button navigates to /signup', async ({ page }) => {
    await page.goto(`${TEST_URL}/preview`);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe('Template Tasks Page', () => {
  test('tasks page renders heading', async ({ page }) => {
    await page.goto(`${TEST_URL}/tasks`);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  });

  test('tasks page shows sign-in prompt when logged out', async ({ page }) => {
    await page.goto(`${TEST_URL}/tasks`);
    await expect(page.getByText('Sign in to manage your tasks')).toBeVisible();
  });
});
