import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Observable } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ExpenseApiService, ExpenseCategory, ExpenseCreateResponse } from './expense-api.service';

declare const $localize: (
  messageParts: TemplateStringsArray,
  ...expressions: readonly unknown[]
) => string;

type ExpenseRow = {
  readonly id: string;
  readonly title: string;
  readonly category: ExpenseCategory;
  readonly amount: number;
  readonly expenseDate: string;
  readonly paidBy: string;
  readonly description: string;
};

type ExpenseForm = {
  readonly title: FormControl<string>;
  readonly amount: FormControl<number | null>;
  readonly category: FormControl<ExpenseCategory>;
  readonly expenseDate: FormControl<string>;
  readonly description: FormControl<string>;
};

@Component({
  selector: 'app-expense-list-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="expenses-title">
      <div class="page-section__inner">
        <div class="toolbar">
          <h1 id="expenses-title" class="heading-section" i18n="Expenses title@@expensesTitle">
            支出
          </h1>
          <button
            class="button button--primary"
            type="button"
            (click)="openCreateModal()"
            i18n="Add expense@@expensesAdd"
          >
            新增支出
          </button>
        </div>

        <label class="field">
          <span i18n="Expense search label@@expensesSearchLabel">搜尋標題</span>
          <input type="search" autocomplete="off" />
        </label>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" i18n="Expense date column@@expensesDate">日期</th>
                <th scope="col" i18n="Expense title column@@expensesTitleColumn">標題</th>
                <th scope="col" i18n="Expense category column@@expensesCategory">分類</th>
                <th scope="col" i18n="Expense payer column@@expensesPaidBy">付款人</th>
                <th scope="col" i18n="Expense amount column@@expensesAmount">金額</th>
                <th scope="col" i18n="Expense participants column@@expensesParticipants">參與者</th>
                <th scope="col" i18n="Expense actions column@@expensesActions">操作</th>
              </tr>
            </thead>
            <tbody>
              @if (expenses().length === 0) {
                <tr>
                  <td colspan="7" i18n="Expenses empty state@@expensesEmpty">目前沒有支出。</td>
                </tr>
              } @else {
                @for (expense of expenses(); track expense.id) {
                  <tr class="expense-row" (click)="openEditModal(expense)">
                    <td>{{ expense.expenseDate }}</td>
                    <td>{{ expense.title }}</td>
                    <td>{{ expense.category }}</td>
                    <td>{{ expense.paidBy }}</td>
                    <td class="money">NT&#36;{{ expense.amount }}</td>
                    <td i18n="Self participant label@@expensesSelfParticipant">本人</td>
                    <td>
                      <button
                        type="button"
                        class="button button--secondary"
                        (click)="openEditModal(expense); $event.stopPropagation()"
                        i18n="Edit expense action@@expensesEditAction"
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    @if (isCreateModalOpen()) {
      <div class="modal-backdrop" (click)="closeCreateModal()" aria-hidden="true"></div>
      <section
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-create-title"
        tabindex="-1"
        (keydown)="handleModalKeydown($event)"
      >
        <form class="expense-form" [formGroup]="form" (ngSubmit)="submitExpense()" novalidate>
          <div class="modal-panel__header">
            <div>
              <p class="eyebrow" i18n="Expense modal eyebrow@@expenseModalEyebrow">
                LabSplit Entry
              </p>
              @if (isEditing()) {
                <h2
                  id="expense-create-title"
                  class="heading-section"
                  i18n="Expense edit modal title@@expenseEditTitle"
                >
                  編輯支出
                </h2>
              } @else {
                <h2
                  id="expense-create-title"
                  class="heading-section"
                  i18n="Expense modal title@@expenseCreateTitle"
                >
                  新增支出
                </h2>
              }
            </div>
            <button
              class="button button--secondary"
              type="button"
              (click)="closeCreateModal()"
              aria-label="關閉新增支出視窗"
              i18n-aria-label="Close expense modal label@@expenseModalCloseLabel"
            >
              ×
            </button>
          </div>

          <div class="expense-modal__field" style="--field-index: 0">
            <label class="field">
              <span i18n="Expense title field@@expenseFieldTitle">標題</span>
              <input #firstExpenseField type="text" formControlName="title" autocomplete="off" />
              @if (titleInvalid()) {
                <span class="field__error" i18n="Expense title error@@expenseTitleError">
                  請輸入 1 到 120 個字的標題。
                </span>
              }
            </label>
          </div>

          <div class="expense-modal__field" style="--field-index: 1">
            <label class="field">
              <span i18n="Expense amount field@@expenseFieldAmount">金額</span>
              <input type="number" inputmode="numeric" min="1" step="1" formControlName="amount" />
              @if (amountInvalid()) {
                <span class="field__error" i18n="Expense amount error@@expenseAmountError">
                  金額必須是正整數。
                </span>
              }
            </label>
          </div>

          <div class="expense-modal__field" style="--field-index: 2">
            <label class="field">
              <span i18n="Expense category field@@expenseFieldCategory">分類</span>
              <select formControlName="category">
                @for (category of categories; track category.value) {
                  <option [value]="category.value">{{ category.label }}</option>
                }
              </select>
            </label>
          </div>

          <div class="expense-modal__field" style="--field-index: 3">
            <label class="field">
              <span i18n="Expense date field@@expenseFieldDate">日期</span>
              <input type="date" formControlName="expenseDate" />
            </label>
          </div>

          <div class="expense-modal__field" style="--field-index: 4">
            <label class="field field--wide">
              <span i18n="Expense description field@@expenseFieldDescription">備註</span>
              <textarea rows="3" formControlName="description"></textarea>
            </label>
          </div>

          <div class="expense-modal__summary expense-modal__field" style="--field-index: 5">
            <span i18n="Expense payer summary@@expensePayerSummary">付款人</span>
            <strong>{{ currentUserName() }}</strong>
            <span i18n="Expense split summary@@expenseSplitSummary"
              >平均分攤：目前先記錄為本人支出。</span
            >
          </div>

          @if (statusMessage()) {
            <p class="field__error" role="status">{{ statusMessage() }}</p>
          }

          <div class="modal-panel__actions">
            <button
              class="button button--secondary"
              type="button"
              (click)="closeCreateModal()"
              i18n="Cancel expense@@expenseCancel"
            >
              取消
            </button>
            <button
              class="button button--primary"
              type="submit"
              [disabled]="isSubmitting()"
              i18n="Save expense@@expenseSave"
            >
              儲存
            </button>
          </div>
        </form>
      </section>
    }
  `,
})
export class ExpenseListPageComponent {
  @ViewChild('firstExpenseField') private readonly firstExpenseField?: ElementRef<HTMLInputElement>;

  private readonly authService = inject(AuthService);
  private readonly expenseApiService = inject(ExpenseApiService);

  protected readonly categories: readonly {
    readonly value: ExpenseCategory;
    readonly label: string;
  }[] = [
    {
      value: 'ingredients',
      label: $localize`:Expense category ingredients@@expenseCategoryIngredients:食材`,
    },
    { value: 'prize', label: $localize`:Expense category prize@@expenseCategoryPrize:獎品` },
    { value: 'other', label: $localize`:Expense category other@@expenseCategoryOther:其他` },
  ];
  protected readonly expenses = signal<readonly ExpenseRow[]>([]);
  protected readonly isCreateModalOpen = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly statusMessage = signal('');
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly isEditing = computed(() => this.editingExpenseId() !== null);
  protected readonly currentUserName = computed(
    () =>
      this.authService.currentUser()?.displayName ??
      this.authService.currentUser()?.email ??
      'User',
  );

  protected readonly form = new FormGroup<ExpenseForm>({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    amount: new FormControl(null, {
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/u)],
    }),
    category: new FormControl('other', { nonNullable: true }),
    expenseDate: new FormControl(new Date().toISOString().slice(0, 10), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
  });

  protected openCreateModal(): void {
    this.editingExpenseId.set(null);
    this.statusMessage.set('');
    this.form.reset({
      title: '',
      amount: null,
      category: 'other',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: '',
    });
    this.isCreateModalOpen.set(true);
    queueMicrotask(() => this.firstExpenseField?.nativeElement.focus());
  }

  protected openEditModal(expense: ExpenseRow): void {
    this.editingExpenseId.set(expense.id);
    this.statusMessage.set('');
    this.form.reset({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      expenseDate: expense.expenseDate,
      description: expense.description,
    });
    this.isCreateModalOpen.set(true);
    queueMicrotask(() => this.firstExpenseField?.nativeElement.focus());
  }

  protected closeCreateModal(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.isCreateModalOpen.set(false);
    this.editingExpenseId.set(null);
    this.form.reset({
      title: '',
      amount: null,
      category: 'other',
      expenseDate: new Date().toISOString().slice(0, 10),
      description: '',
    });
  }

  protected submitExpense(): void {
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      this.statusMessage.set(
        $localize`:Expense auth required@@expenseAuthRequired:請先登入後再新增支出。`,
      );
      return;
    }

    if (this.form.invalid || this.form.controls.amount.value === null) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.getRawValue();
    const amount = Number(formValue.amount);
    this.isSubmitting.set(true);
    this.statusMessage.set('');

    const editingId = this.editingExpenseId();
    const request$: Observable<ExpenseCreateResponse> = editingId
      ? this.expenseApiService.updateExpense(editingId, {
          title: formValue.title.trim(),
          description: formValue.description.trim() || null,
          amount,
          category: formValue.category,
          expenseDate: formValue.expenseDate,
        })
      : this.expenseApiService.createExpense({
          title: formValue.title.trim(),
          description: formValue.description.trim() || undefined,
          amount,
          currency: 'TWD',
          paidByUserId: currentUser.id,
          category: formValue.category,
          expenseDate: formValue.expenseDate,
          splitMethod: 'equal',
          participants: [{ userId: currentUser.id }],
        });

    request$.subscribe({
      next: (response) => {
        const row: ExpenseRow = {
          id: response.expense.id,
          title: formValue.title.trim(),
          category: formValue.category,
          amount,
          expenseDate: formValue.expenseDate,
          paidBy: currentUser.displayName,
          description: formValue.description.trim(),
        };
        this.expenses.update((expenses) =>
          editingId
            ? expenses.map((expense) => (expense.id === editingId ? row : expense))
            : [row, ...expenses],
        );
        this.isSubmitting.set(false);
        this.closeCreateModal();
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        this.statusMessage.set(this.formatSubmitError(err));
      },
    });
  }

  protected handleModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeCreateModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const panel = event.currentTarget as HTMLElement;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled'));
    const first = focusable[0];
    const last = focusable.at(-1);

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private formatSubmitError(error: HttpErrorResponse): string {
    const fallback = $localize`:Expense create failed@@expenseCreateFailed:支出建立失敗，請稍後再試。`;
    const apiError = (error.error as { error?: { message?: string } } | null)?.error;
    return apiError?.message ?? fallback;
  }

  protected titleInvalid(): boolean {
    const control = this.form.controls.title;
    return control.invalid && (control.dirty || control.touched);
  }

  protected amountInvalid(): boolean {
    const control = this.form.controls.amount;
    return control.invalid && (control.dirty || control.touched);
  }
}
