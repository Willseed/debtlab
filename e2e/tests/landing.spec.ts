import { expect, test } from '@playwright/test';

test('guest can view the zh-TW landing page login options', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: '實驗室花費，精準拆帳',
    }),
  ).toBeVisible();
  await expect(page.getByText('給任何人使用的共同支出拆帳儀表板。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 Google 繼續' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用 Apple 繼續' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '使用 Google 繼續' })).toHaveClass(
    /oauth-button--google/u,
  );
  await expect(page.getByRole('button', { name: '使用 Apple 繼續' })).toHaveClass(
    /oauth-button--apple/u,
  );
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

test('Apple login button starts the backend OAuth flow', async ({ page }) => {
  await page.route('**/api/auth/apple/start', async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.goto('/');

  const appleStartRequest = page.waitForRequest('**/api/auth/apple/start');
  await page.getByRole('button', { name: '使用 Apple 繼續' }).click();

  expect((await appleStartRequest).method()).toBe('GET');
});

test('authenticated member uses authenticated navigation without seeing login or admin entry points', async ({
  page,
}) => {
  type ExpenseListItem = {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly amount: number;
    readonly currency: 'TWD';
    readonly category: 'ingredients' | 'prize' | 'lodging' | 'other';
    readonly expenseDate: string;
    readonly paidBy: {
      readonly id: string;
      readonly displayName: string;
    };
    readonly participants: readonly {
      readonly userId: string;
      readonly displayName: string;
      readonly shareAmount: number;
    }[];
    readonly canEdit: boolean;
    readonly canDelete: boolean;
  };
  type ExpenseCreateRequest = {
    readonly title: string;
    readonly amount: number;
    readonly category: 'ingredients' | 'prize' | 'lodging' | 'other';
    readonly expenseDate: string;
    readonly paidByUserId: string;
    readonly participants: readonly { readonly userId: string }[];
  };
  let persistedExpenses: readonly ExpenseListItem[] = [];

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

  await page.route('**/api/expenses', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as ExpenseCreateRequest;
      persistedExpenses = [
        {
          id: 'exp_e2e',
          title: body.title,
          description: null,
          amount: body.amount,
          currency: 'TWD',
          category: body.category,
          expenseDate: body.expenseDate,
          paidBy: {
            id: 'usr_member',
            displayName: 'Member User',
          },
          participants: [
            {
              userId: 'usr_member',
              displayName: 'Member User',
              shareAmount: body.amount,
            },
          ],
          canEdit: true,
          canDelete: true,
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ expense: { id: 'exp_e2e' } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expenses: persistedExpenses, nextCursor: null }),
    });
  });
  await page.route('**/api/members', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        members: [
          {
            userId: 'usr_member',
            displayName: 'Member User',
            role: 'member',
            status: 'active',
            joinedAt: '2026-06-16 09:00:00',
          },
        ],
      }),
    });
  });
  await page.route('**/api/settlements/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currency: 'TWD',
        balances: [{ userId: 'usr_member', displayName: 'Member User', net: 0 }],
        suggestedTransfers: [],
        pendingPayments: [],
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

  await page.getByRole('button', { name: '新增支出' }).click();
  const dialog = page.getByRole('dialog', { name: '新增支出' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('標題').fill('E2E Hotel');
  await dialog.getByLabel('金額').fill('9600');
  await dialog.getByLabel('分類').selectOption('lodging');
  await dialog.getByLabel('日期').fill('2026-06-13');

  const createExpenseRequest = page.waitForRequest(
    (request) => request.url().endsWith('/api/expenses') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: '儲存' }).click();

  const request = await createExpenseRequest;
  expect(request.postDataJSON()).toMatchObject({
    title: 'E2E Hotel',
    amount: 9600,
    category: 'lodging',
    expenseDate: '2026-06-13',
    paidByUserId: 'usr_member',
    splitMethod: 'equal',
    participants: [{ userId: 'usr_member' }],
  });
  await expect(page.getByText('E2E Hotel')).toBeVisible();
  await expect(page.getByText('住宿')).toBeVisible();
});
