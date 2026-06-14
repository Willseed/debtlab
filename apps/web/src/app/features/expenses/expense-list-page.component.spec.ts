import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
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

    setInputValue('input[formcontrolname="title"]', 'Coffee Beans');
    setInputValue('input[formcontrolname="amount"]', '1280');
    setInputValue('input[formcontrolname="expenseDate"]', '2026-06-13');
    setSelectValue('select[formcontrolname="category"]', 'ingredients');
    clickButton('儲存');

    const request = http.expectOne('/api/expenses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Coffee Beans',
      description: undefined,
      amount: 1280,
      currency: 'TWD',
      paidByUserId: 'usr_member',
      category: 'ingredients',
      expenseDate: '2026-06-13',
      splitMethod: 'equal',
      participants: [{ userId: 'usr_member' }],
    });

    request.flush({ expense: { id: 'exp_created' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Coffee Beans');
    expect(fixture.nativeElement.textContent).toContain('NT$1280');
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
  });

  it('opens edit mode when a row is clicked and PATCHes the changes', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    setInputValue('textarea[formcontrolname="description"]', 'Initial note');
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_alice' } });
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
    clickButton('儲存');

    const patch = http.expectOne('/api/expenses/exp_alice');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      title: 'Coffee Refill',
      description: 'Initial note',
      amount: 1500,
      category: 'ingredients',
      expenseDate: '2026-06-13',
    });
    patch.flush({ expense: { id: 'exp_alice' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Coffee Refill');
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
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.expense-row button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInputValue('textarea[formcontrolname="description"]', '');
    clickButton('儲存');

    const patch = http.expectOne('/api/expenses/exp_blank');
    expect(patch.request.body.description).toBeNull();
    patch.flush({ expense: { id: 'exp_blank' } });
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

  function clickButton(name: string): void {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);

    if (!button) {
      throw new Error(`Button not found: ${name}`);
    }

    button.click();
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
});
