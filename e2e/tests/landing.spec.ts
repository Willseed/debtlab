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
  await expect(page.getByRole('button', { name: '使用 Apple 繼續' })).toBeVisible();
});
