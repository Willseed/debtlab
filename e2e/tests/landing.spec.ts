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
