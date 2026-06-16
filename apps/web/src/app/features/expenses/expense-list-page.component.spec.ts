import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { ExpenseListItem } from './expense-api.service';
import { ExpenseListPageComponent } from './expense-list-page.component';

describe('ExpenseListPageComponent', () => {
  const currentUser: CurrentUser = {
    id: 'usr_member',
    email: 'member@example.com',
    displayName: 'Member User',
    role: 'member',
    status: 'active',
  };

  let fixture: ComponentFixture<ExpenseListPageComponent>;
  let http: HttpTestingController;
  let currentUserState: ReturnType<typeof signal<CurrentUser | null>>;

  beforeEach(async () => {
    currentUserState = signal<CurrentUser | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [ExpenseListPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserState,
          } satisfies Pick<AuthService, 'currentUser'>,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseListPageComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushExpenseList();
  });

  afterEach(() => {
    http.verify();
  });

  it('opens and closes the add-expense modal', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('LabSplit Entry');

    clickButton('取消');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('LabSplit Entry');
  });

  it('validates required expense fields before submit', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    setInputValue('input[formcontrolname="title"]', '');
    setInputValue('input[formcontrolname="amount"]', '');
    clickButton('儲存');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('請輸入 1 到 120 個字的標題。');
    expect(fixture.nativeElement.textContent).toContain('金額必須是正整數。');
  });

  it('submits a self-paid equal split expense and adds it to the table', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    setInputValue('input[formcontrolname="title"]', 'Conference Hotel');
    setInputValue('input[formcontrolname="amount"]', '9600');
    setInputValue('input[formcontrolname="expenseDate"]', '2026-06-13');
    setSelectValue('select[formcontrolname="category"]', 'lodging');
    clickButton('儲存');

    const request = http.expectOne('/api/expenses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Conference Hotel',
      description: undefined,
      amount: 9600,
      currency: 'TWD',
      paidByUserId: 'usr_member',
      category: 'lodging',
      expenseDate: '2026-06-13',
      splitMethod: 'equal',
      participants: [{ userId: 'usr_member' }],
    });

    request.flush({ expense: { id: 'exp_created' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_created',
        title: 'Conference Hotel',
        amount: 9600,
        category: 'lodging',
        expenseDate: '2026-06-13',
      }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Conference Hotel');
    expect(fixture.nativeElement.textContent).toContain('住宿');
    expect(fixture.nativeElement.textContent).not.toContain('lodging');
    expect(fixture.nativeElement.textContent).toContain('NT$9600');
  });

  it('renders localized category labels in the expense table', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_categories' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_ingredients',
        title: 'Coffee Beans',
        category: 'ingredients',
      }),
      createExpenseItem({
        id: 'exp_prize',
        title: 'Award Envelope',
        category: 'prize',
      }),
      createExpenseItem({
        id: 'exp_lodging',
        title: 'Conference Hotel',
        category: 'lodging',
      }),
      createExpenseItem({
        id: 'exp_other',
        title: 'Venue Fee',
        category: 'other',
      }),
    ]);
    fixture.detectChanges();

    const categoryCells = Array.from(
      fixture.nativeElement.querySelectorAll(
        'tr.expense-row td:nth-child(3)',
      ) as NodeListOf<HTMLTableCellElement>,
    ).map((cell) => cell.textContent?.trim());

    expect(categoryCells).toEqual(['食材', '獎品', '住宿', '其他']);
    expect(categoryCells).not.toContain('ingredients');
    expect(categoryCells).not.toContain('prize');
    expect(categoryCells).not.toContain('other');
    expect(categoryCells).not.toContain('lodging');
  });

  it('includes optional descriptions when submitting expenses', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    setInputValue('textarea[formcontrolname="description"]', 'Shared coffee beans');
    clickButton('儲存');

    const request = http.expectOne('/api/expenses');
    expect(request.request.body.description).toBe('Shared coffee beans');
    request.flush({ expense: { id: 'exp_with_description' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_with_description',
        description: 'Shared coffee beans',
      }),
    ]);
  });

  it('opens edit mode for creators when a row is clicked and PATCHes the changes', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    setInputValue('textarea[formcontrolname="description"]', 'Initial note');
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_alice' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_alice',
        description: 'Initial note',
      }),
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('編輯支出');
    expect(
      (fixture.nativeElement.querySelector('input[formcontrolname="title"]') as HTMLInputElement)
        .value,
    ).toBe('Coffee Beans');
    expect(
      (
        fixture.nativeElement.querySelector(
          'textarea[formcontrolname="description"]',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Initial note');

    setInputValue('input[formcontrolname="title"]', 'Coffee Refill');
    setInputValue('input[formcontrolname="amount"]', '1500');
    setSelectValue('select[formcontrolname="category"]', 'lodging');
    clickButton('儲存');

    const patch = http.expectOne('/api/expenses/exp_alice');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      title: 'Coffee Refill',
      description: 'Initial note',
      amount: 1500,
      category: 'lodging',
      expenseDate: '2026-06-13',
    });
    patch.flush({ expense: { id: 'exp_alice' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_alice',
        title: 'Coffee Refill',
        amount: 1500,
        category: 'lodging',
        description: 'Initial note',
      }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Coffee Refill');
    expect(fixture.nativeElement.textContent).toContain('住宿');
    expect(fixture.nativeElement.textContent).toContain('NT$1500');
    expect(fixture.nativeElement.textContent).not.toContain('Coffee Beans');
  });

  it('sends a null description when the user clears it before updating', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    setInputValue('textarea[formcontrolname="description"]', 'will be cleared');
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_blank' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_blank',
        description: 'will be cleared',
      }),
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.expense-row button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInputValue('textarea[formcontrolname="description"]', '');
    clickButton('儲存');

    const patch = http.expectOne('/api/expenses/exp_blank');
    expect(patch.request.body.description).toBeNull();
    patch.flush({ expense: { id: 'exp_blank' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_blank',
        description: null,
      }),
    ]);
  });

  it('renders pencil edit and trash delete icon actions for creators', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_icons' } });
    flushExpenseList([createExpenseItem({ id: 'exp_icons' })]);
    fixture.detectChanges();

    const editButton = fixture.nativeElement.querySelector(
      'button[aria-label="編輯支出"]',
    ) as HTMLButtonElement | null;
    const deleteButton = fixture.nativeElement.querySelector(
      'button[aria-label="刪除支出"]',
    ) as HTMLButtonElement | null;

    expect(editButton?.querySelector('svg')).not.toBeNull();
    expect(deleteButton?.querySelector('svg')).not.toBeNull();
  });

  it('shows non-creator expenses as read-only without edit or delete actions', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_readonly' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_readonly',
        paidBy: {
          id: 'usr_other',
          displayName: 'Other Member',
        },
        canEdit: false,
        canDelete: false,
      }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button[aria-label="編輯支出"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="刪除支出"]')).toBeNull();

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('支出明細');
    expect(fixture.nativeElement.textContent).toContain('Coffee Beans');
    expect(fixture.nativeElement.textContent).toContain('Other Member');
    expect(fixture.nativeElement.textContent).not.toContain('編輯支出');
    expect(fixture.nativeElement.textContent).not.toContain('儲存');
    http.expectNone('/api/expenses/exp_readonly');
  });

  it('opens a delete confirmation modal before soft deleting and reloading the list', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_delete' } });
    flushExpenseList([createExpenseItem({ id: 'exp_delete' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('確定要刪除這筆支出嗎？');
    expect(fixture.nativeElement.textContent).toContain('將刪除');
    expect(fixture.nativeElement.textContent).toContain('Coffee Beans');
    http.expectNone('/api/expenses/exp_delete');
    expect(
      (fixture.nativeElement.querySelector('button[aria-label="編輯支出"]') as HTMLButtonElement)
        .disabled,
    ).toBeTrue();

    clickButton('刪除');
    fixture.detectChanges();

    const request = http.expectOne('/api/expenses/exp_delete');
    expect(request.request.method).toBe('DELETE');
    expect(
      (fixture.nativeElement.querySelector('button[aria-label="編輯支出"]') as HTMLButtonElement)
        .disabled,
    ).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('刪除中…');

    const deleteDialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    deleteDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('刪除中…');
    (
      fixture.componentInstance as unknown as {
        readonly deletePendingExpense: () => void;
      }
    ).deletePendingExpense();
    http.expectNone('/api/expenses/exp_delete');

    request.flush({ ok: true });
    flushExpenseList();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('目前沒有支出。');
    expect(fixture.nativeElement.textContent).not.toContain('確定要刪除這筆支出嗎？');
  });

  it('does not open edit mode from the row while the delete modal or request is pending', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_deleting' } });
    flushExpenseList([createExpenseItem({ id: 'exp_deleting' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('LabSplit Entry');

    clickButton('刪除');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('LabSplit Entry');
    http.expectOne('/api/expenses/exp_deleting').flush({ ok: true });
    flushExpenseList();
  });

  it('does not delete when the delete confirmation modal is cancelled', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_keep' } });
    flushExpenseList([createExpenseItem({ id: 'exp_keep' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('確定要刪除這筆支出嗎？');
    clickButton('取消');
    fixture.detectChanges();

    http.expectNone('/api/expenses/exp_keep');
    expect(fixture.nativeElement.textContent).not.toContain('確定要刪除這筆支出嗎？');
    expect(
      (fixture.nativeElement.querySelector('button[aria-label="編輯支出"]') as HTMLButtonElement)
        .disabled,
    ).toBeFalse();
  });

  it('does not open delete confirmation while the expense form modal is open', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_create_modal_guard' } });
    flushExpenseList([createExpenseItem({ id: 'exp_create_modal_guard' })]);
    fixture.detectChanges();

    clickButton('新增支出');
    fixture.detectChanges();
    clickDeleteIcon();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('LabSplit Entry');
    expect(fixture.nativeElement.textContent).not.toContain('確定要刪除這筆支出嗎？');
    http.expectNone('/api/expenses/exp_create_modal_guard');
  });

  it('closes the delete confirmation with Escape and wraps focus within the dialog', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_keyboard_delete' } });
    flushExpenseList([createExpenseItem({ id: 'exp_keyboard_delete' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const cancelButton = findButton('取消');
    const deleteButton = findButton('刪除');

    cancelButton.focus();
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(globalThis.document.activeElement).toBe(deleteButton);

    deleteButton.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(globalThis.document.activeElement).toBe(cancelButton);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    http.expectNone('/api/expenses/exp_keyboard_delete');
    expect(fixture.nativeElement.textContent).not.toContain('確定要刪除這筆支出嗎？');
  });

  it('surfaces an API delete error and reloads the list', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_delete_error' } });
    flushExpenseList([createExpenseItem({ id: 'exp_delete_error' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();
    clickButton('刪除');
    http.expectOne('/api/expenses/exp_delete_error').flush(
      {
        error: {
          code: 'DELETE_FAILED',
          message: 'Expense delete failed.',
          details: {},
        },
      },
      { status: 500, statusText: 'Internal Server Error' },
    );
    flushExpenseList([createExpenseItem({ id: 'exp_delete_error' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Expense delete failed.');
    expect(fixture.nativeElement.textContent).not.toContain('確定要刪除這筆支出嗎？');
    expect(
      (fixture.nativeElement.querySelector('button[aria-label="編輯支出"]') as HTMLButtonElement)
        .disabled,
    ).toBeFalse();
  });

  it('falls back to a generic message when deleting fails without an API message', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_delete_network' } });
    flushExpenseList([createExpenseItem({ id: 'exp_delete_network' })]);
    fixture.detectChanges();

    clickDeleteIcon();
    fixture.detectChanges();
    clickButton('刪除');
    http.expectOne('/api/expenses/exp_delete_network').error(new ProgressEvent('error'), {
      status: 0,
      statusText: 'Network Error',
    });
    flushExpenseList([createExpenseItem({ id: 'exp_delete_network' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('支出刪除失敗，請稍後再試。');
  });

  it('keeps the modal open while submitting and then surfaces the API error message', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    fixture.detectChanges();

    clickButton('取消');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('LabSplit Entry');

    http.expectOne('/api/expenses').flush(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Expense request is invalid.',
          details: {},
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Expense request is invalid.');
  });

  it('falls back to a generic message when the API error has no message', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');

    http.expectOne('/api/expenses').error(new ProgressEvent('error'), {
      status: 0,
      statusText: 'Network Error',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('支出建立失敗，請稍後再試。');
  });

  it('clears the expense list when reloading expenses fails', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_reload_error' } });

    http.expectOne('/api/expenses').error(new ProgressEvent('error'), {
      status: 0,
      statusText: 'Network Error',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('目前沒有支出。');
  });

  it('shows an auth-required message when no current user is available', () => {
    currentUserState.set(null);
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('請先登入後再新增支出。');
  });

  it('closes with Escape and wraps focus within the modal', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const closeButton = fixture.nativeElement.querySelector(
      'button[aria-label="關閉新增支出視窗"]',
    ) as HTMLButtonElement;
    const firstInput = fixture.nativeElement.querySelector(
      'input[formcontrolname="title"]',
    ) as HTMLInputElement;
    const saveButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === '儲存');

    if (!saveButton) {
      throw new Error('Save button not found');
    }

    closeButton.focus();
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(globalThis.document.activeElement).toBe(saveButton);

    saveButton.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(globalThis.document.activeElement).toBe(closeButton);

    firstInput.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(globalThis.document.activeElement).toBe(firstInput);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('LabSplit Entry');
  });

  it('leaves Tab alone when the modal has no focusable controls', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    for (const control of dialog.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('button, input, select, textarea')) {
      control.disabled = true;
    }

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventDefaultSpy = spyOn(event, 'preventDefault');
    dialog.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  function clickButton(name: string): void {
    findButton(name).click();
  }

  function findButton(name: string): HTMLButtonElement {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);

    if (!button) {
      throw new Error(`Button not found: ${name}`);
    }

    return button;
  }

  function clickDeleteIcon(): void {
    (
      fixture.nativeElement.querySelector('button[aria-label="刪除支出"]') as HTMLButtonElement
    ).click();
  }

  function setInputValue(selector: string, value: string): void {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function setSelectValue(selector: string, value: string): void {
    const select = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  function fillValidExpense(): void {
    setInputValue('input[formcontrolname="title"]', 'Coffee Beans');
    setInputValue('input[formcontrolname="amount"]', '1280');
    setInputValue('input[formcontrolname="expenseDate"]', '2026-06-13');
    setSelectValue('select[formcontrolname="category"]', 'ingredients');
  }

  function flushExpenseList(expenses: readonly ExpenseListItem[] = []): void {
    const request = http.expectOne('/api/expenses');
    expect(request.request.method).toBe('GET');
    request.flush({ expenses, nextCursor: null });
    fixture.detectChanges();
  }

  function createExpenseItem(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
    return {
      id: 'exp_fixture',
      title: 'Coffee Beans',
      description: null,
      amount: 1280,
      currency: 'TWD',
      category: 'ingredients',
      expenseDate: '2026-06-13',
      paidBy: {
        id: currentUser.id,
        displayName: currentUser.displayName,
      },
      participants: [
        {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          shareAmount: overrides.amount ?? 1280,
        },
      ],
      canEdit: true,
      canDelete: true,
      ...overrides,
    };
  }
});
