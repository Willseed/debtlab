import { expect, test } from '@playwright/test';

test('guest can view the zh-TW landing page login options', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: '實驗室花費，精準拆帳',
    }),
  ).toBeVisible();
  await expect(page.getByText('給實驗室共同支出使用的私有拆帳儀表板。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 Google 繼續' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 Apple 繼續' })).toBeDisabled();
  await expect(page.getByText('Apple 登入審核中，暫不開放。')).toBeVisible();
});

test('Google login button starts the backend OAuth flow', async ({ page }) => {
  await page.route('**/api/auth/google/start', async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.goto('/');

  const googleStartRequest = page.waitForRequest('**/api/auth/google/start');
  await page.getByRole('button', { name: '使用 Google 繼續' }).click();

  expect((await googleStartRequest).method()).toBe('GET');
});

test('authenticated member uses private navigation without seeing login or admin entry points', async ({
  page,
}) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'usr_member',
          email: 'member@example.com',
          displayName: 'Member User',
          role: 'member',
          status: 'active',
        },
      }),
    });
  });

  await page.goto('/');

  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole('button', { name: '使用 Google 繼續' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '首頁' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '管理' })).toHaveCount(0);

  await page.getByRole('link', { name: '支出' }).click();
  await expect(page).toHaveURL(/\/expenses$/u);
  await expect(page.getByRole('heading', { name: '支出' })).toBeVisible();

  await page.getByRole('link', { name: '新增支出' }).click();
  await expect(page).toHaveURL(/\/expenses\/new$/u);
  await expect(page.getByRole('heading', { name: '新增支出' })).toBeVisible();
});
