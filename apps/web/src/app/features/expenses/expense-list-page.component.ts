import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Observable } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import {
  ExpenseApiService,
  ExpenseCategory,
  ExpenseCreateResponse,
  ExpenseListItem,
  ExpenseParticipantResponse,
  MemberListItem,
} from './expense-api.service';

declare const $localize: (
  messageParts: TemplateStringsArray,
  ...expressions: readonly unknown[]
) => string;

type ExpenseRow = {
  readonly id: string;
  readonly title: string;
  readonly category: ExpenseCategory;
  readonly categoryLabel: string;
  readonly amount: number;
  readonly expenseDate: string;
  readonly paidById: string;
  readonly paidBy: string;
  readonly participantIds: readonly string[];
  readonly participantsLabel: string;
  readonly description: string;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
};

type ExpenseForm = {
  readonly title: FormControl<string>;
  readonly amount: FormControl<number | null>;
  readonly category: FormControl<ExpenseCategory>;
  readonly expenseDate: FormControl<string>;
  readonly paidByUserId: FormControl<string>;
  readonly participantUserIds: FormControl<readonly string[]>;
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
                  <tr class="expense-row" (click)="openExpense(expense)">
                    <td>{{ expense.expenseDate }}</td>
                    <td>{{ expense.title }}</td>
                    <td>{{ expense.categoryLabel }}</td>
                    <td>{{ expense.paidBy }}</td>
                    <td class="money">NT&#36;{{ expense.amount }}</td>
                    <td>{{ expense.participantsLabel }}</td>
                    <td>
                      <div class="action-group">
                        @if (expense.canEdit) {
                          <button
                            type="button"
                            class="button button--secondary button--icon"
                            (click)="openEditModal(expense); $event.stopPropagation()"
                            [disabled]="isExpenseActionDisabled(expense.id)"
                            aria-label="編輯支出"
                            title="編輯支出"
                            i18n-aria-label="Edit expense action label@@expensesEditActionLabel"
                            i18n-title="Edit expense action title@@expensesEditActionTitle"
                          >
                            <svg
                              aria-hidden="true"
                              focusable="false"
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                            >
                              <path
                                d="M4 20h4.2L18.6 9.6a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.8"
                              />
                              <path
                                d="m13.5 6.5 4 4"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-width="1.8"
                              />
                            </svg>
                          </button>
                        }
                        @if (expense.canDelete) {
                          <button
                            type="button"
                            class="button button--secondary button--icon"
                            (click)="openDeleteModal(expense); $event.stopPropagation()"
                            [disabled]="isExpenseActionDisabled(expense.id)"
                            aria-label="刪除支出"
                            title="刪除支出"
                            i18n-aria-label="Delete expense action label@@expensesDeleteActionLabel"
                            i18n-title="Delete expense action title@@expensesDeleteActionTitle"
                          >
                            <svg
                              aria-hidden="true"
                              focusable="false"
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                            >
                              <path
                                d="M5 7h14"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-width="1.8"
                              />
                              <path
                                d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.8"
                              />
                              <path
                                d="m8 10 .6 8.2A2 2 0 0 0 10.6 20h2.8a2 2 0 0 0 2-1.8L16 10"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.8"
                              />
                            </svg>
                          </button>
                        }
                        @if (canCurrentUserChangeParticipation()) {
                          @if (isCurrentUserParticipant(expense)) {
                            <button
                              type="button"
                              class="button button--secondary button--icon"
                              (click)="leaveExpenseParticipant(expense, $event)"
                              [disabled]="isExpenseActionDisabled(expense.id)"
                              aria-label="退出支出"
                              title="退出支出"
                              i18n-aria-label="Leave expense action label@@expensesLeaveActionLabel"
                              i18n-title="Leave expense action title@@expensesLeaveActionTitle"
                            >
                              <svg
                                aria-hidden="true"
                                focusable="false"
                                viewBox="0 0 24 24"
                                width="20"
                                height="20"
                              >
                                <path
                                  d="M7 4h7a2 2 0 0 1 2 2v3"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="1.8"
                                />
                                <path
                                  d="M16 15v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="1.8"
                                />
                                <path
                                  d="M10 12h9"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-width="1.8"
                                />
                                <path
                                  d="m16 9 3 3-3 3"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="1.8"
                                />
                              </svg>
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="button button--secondary button--icon"
                              (click)="joinExpenseParticipant(expense, $event)"
                              [disabled]="isExpenseActionDisabled(expense.id)"
                              aria-label="加入支出"
                              title="加入支出"
                              i18n-aria-label="Join expense action label@@expensesJoinActionLabel"
                              i18n-title="Join expense action title@@expensesJoinActionTitle"
                            >
                              <svg
                                aria-hidden="true"
                                focusable="false"
                                viewBox="0 0 24 24"
                                width="20"
                                height="20"
                              >
                                <path
                                  d="M8 12h8"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-width="1.8"
                                />
                                <path
                                  d="M12 8v8"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-width="1.8"
                                />
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="8"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="1.8"
                                />
                              </svg>
                            </button>
                          }
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (listStatusMessage()) {
          <p class="field__error" role="status">{{ listStatusMessage() }}</p>
        }
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

          <div class="expense-modal__field expense-modal__field--0">
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

          <div class="expense-modal__field expense-modal__field--1">
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

          <div class="expense-modal__field expense-modal__field--2">
            <label class="field">
              <span i18n="Expense category field@@expenseFieldCategory">分類</span>
              <select formControlName="category">
                @for (category of categories; track category.value) {
                  <option [value]="category.value">{{ category.label }}</option>
                }
              </select>
            </label>
          </div>

          <div class="expense-modal__field expense-modal__field--3">
            <label class="field">
              <span i18n="Expense date field@@expenseFieldDate">日期</span>
              <input type="date" formControlName="expenseDate" />
            </label>
          </div>

          <div class="expense-modal__field expense-modal__field--4">
            <label class="field field--wide">
              <span i18n="Expense description field@@expenseFieldDescription">備註</span>
              <textarea rows="3" formControlName="description"></textarea>
            </label>
          </div>

          @if (isEditing()) {
            <div class="expense-modal__summary expense-modal__field expense-modal__field--5">
              <span i18n="Expense payer summary@@expensePayerSummary">付款人</span>
              <strong>{{ editingExpenseSummary()?.paidBy }}</strong>
            </div>
            <div class="expense-modal__summary expense-modal__field expense-modal__field--6">
              <span i18n="Expense participants column@@expensesParticipants">參與者</span>
              <strong>{{ editingExpenseSummary()?.participantsLabel }}</strong>
              <span i18n="Expense edit split locked@@expenseEditSplitLocked"
                >分攤成員沿用原支出設定。</span
              >
            </div>
          } @else {
            <div class="expense-modal__field expense-modal__field--5">
              <label class="field">
                <span i18n="Expense payer summary@@expensePayerSummary">付款人</span>
                <select formControlName="paidByUserId">
                  @for (member of activeMemberOptions(); track member.userId) {
                    <option [value]="member.userId">{{ member.displayName }}</option>
                  }
                </select>
              </label>
            </div>

            <div class="expense-modal__field expense-modal__field--6">
              <label class="field">
                <span i18n="Expense participants column@@expensesParticipants">參與者</span>
                <select multiple size="4" formControlName="participantUserIds">
                  @for (member of activeMemberOptions(); track member.userId) {
                    <option [value]="member.userId">{{ member.displayName }}</option>
                  }
                </select>
                <span class="muted" i18n="Expense participant select hint@@expenseParticipantHint"
                  >按住 Command 或 Shift 可選取多位成員。</span
                >
                @if (participantsInvalid()) {
                  <span
                    class="field__error"
                    i18n="Expense participants error@@expenseParticipantsError"
                  >
                    請至少選取一位參與者。
                  </span>
                }
              </label>
            </div>

            <div class="expense-modal__summary expense-modal__field expense-modal__field--7">
              <span i18n="Expense split summary@@expenseSplitSummary"
                >平均分攤：將在選取的參與者之間分攤。</span
              >
            </div>
          }

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

    @if (viewingExpense(); as expense) {
      <div class="modal-backdrop" (click)="closeViewModal()" aria-hidden="true"></div>
      <section
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-view-title"
        tabindex="-1"
        (keydown)="handleViewModalKeydown($event)"
      >
        <div class="expense-form">
          <div class="modal-panel__header">
            <div>
              <p class="eyebrow" i18n="Expense modal eyebrow@@expenseModalEyebrow">
                LabSplit Entry
              </p>
              <h2
                id="expense-view-title"
                class="heading-section"
                i18n="Expense detail modal title@@expenseDetailTitle"
              >
                支出明細
              </h2>
            </div>
            <button
              #viewCloseButton
              class="button button--secondary"
              type="button"
              (click)="closeViewModal()"
              aria-label="關閉支出明細"
              i18n-aria-label="Close expense detail modal label@@expenseDetailCloseLabel"
            >
              ×
            </button>
          </div>

          <div class="expense-modal__summary">
            <span i18n="Expense title field@@expenseFieldTitle">標題</span>
            <strong>{{ expense.title }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense amount field@@expenseFieldAmount">金額</span>
            <strong>NT&#36;{{ expense.amount }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense category field@@expenseFieldCategory">分類</span>
            <strong>{{ expense.categoryLabel }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense date field@@expenseFieldDate">日期</span>
            <strong>{{ expense.expenseDate }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense payer summary@@expensePayerSummary">付款人</span>
            <strong>{{ expense.paidBy }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense participants column@@expensesParticipants">參與者</span>
            <strong>{{ expense.participantsLabel }}</strong>
          </div>
          <div class="expense-modal__summary">
            <span i18n="Expense description field@@expenseFieldDescription">備註</span>
            <strong>{{ expense.description || emptyDescriptionLabel }}</strong>
          </div>
        </div>
      </section>
    }

    @if (pendingDeleteExpense(); as deleteExpense) {
      <div class="modal-backdrop" (click)="closeDeleteModal()" aria-hidden="true"></div>
      <section
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-delete-title"
        aria-describedby="expense-delete-description expense-delete-target"
        tabindex="-1"
        [attr.aria-busy]="deletingExpenseIds().has(deleteExpense.id)"
        (keydown)="handleDeleteModalKeydown($event)"
      >
        <div class="modal-panel__header">
          <div>
            <p class="eyebrow" i18n="Expense delete modal eyebrow@@expenseDeleteEyebrow">
              LabSplit Delete
            </p>
            <h2
              id="expense-delete-title"
              class="heading-section"
              i18n="Expense delete confirmation@@expenseDeleteConfirm"
            >
              確定要刪除這筆支出嗎？
            </h2>
          </div>
        </div>

        <p
          id="expense-delete-description"
          i18n="Expense delete description@@expenseDeleteDescription"
        >
          刪除後會從目前清單移除，並重新載入支出資料。
        </p>

        <div id="expense-delete-target" class="expense-modal__summary">
          <span i18n="Expense delete target label@@expenseDeleteTarget">將刪除</span>
          <strong>{{ deleteExpense.title }}</strong>
        </div>

        <div class="modal-panel__actions">
          <button
            #deleteCancelButton
            class="button button--secondary"
            type="button"
            (click)="closeDeleteModal()"
            [disabled]="deletingExpenseIds().has(deleteExpense.id)"
            i18n="Cancel expense@@expenseCancel"
          >
            取消
          </button>
          <button
            class="button button--primary"
            type="button"
            (click)="deletePendingExpense()"
            [disabled]="deletingExpenseIds().has(deleteExpense.id)"
          >
            @if (deletingExpenseIds().has(deleteExpense.id)) {
              <span i18n="Expense delete in progress@@expenseDeleteInProgress">刪除中…</span>
            } @else {
              <span i18n="Confirm expense delete@@expenseDeleteAction">刪除</span>
            }
          </button>
        </div>
      </section>
    }
  `,
})
export class ExpenseListPageComponent implements OnInit {
  @ViewChild('firstExpenseField') private readonly firstExpenseField?: ElementRef<HTMLInputElement>;
  @ViewChild('viewCloseButton') private readonly viewCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('deleteCancelButton')
  private readonly deleteCancelButton?: ElementRef<HTMLButtonElement>;

  private readonly authService = inject(AuthService);
  private readonly expenseApiService = inject(ExpenseApiService);

  private readonly categoryLabels: Readonly<Record<ExpenseCategory, string>> = {
    ingredients: $localize`:Expense category ingredients@@expenseCategoryIngredients:食材`,
    prize: $localize`:Expense category prize@@expenseCategoryPrize:獎品`,
    lodging: $localize`:Expense category lodging@@expenseCategoryLodging:住宿`,
    other: $localize`:Expense category other@@expenseCategoryOther:其他`,
  };
  protected readonly emptyDescriptionLabel = $localize`:Expense empty description@@expenseEmptyDescription:—`;
  protected readonly categories: readonly {
    readonly value: ExpenseCategory;
    readonly label: string;
  }[] = [
    { value: 'ingredients', label: this.categoryLabels.ingredients },
    { value: 'prize', label: this.categoryLabels.prize },
    { value: 'lodging', label: this.categoryLabels.lodging },
    { value: 'other', label: this.categoryLabels.other },
  ];
  protected readonly members = signal<readonly MemberListItem[]>([]);
  protected readonly expenses = signal<readonly ExpenseRow[]>([]);
  protected readonly isCreateModalOpen = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly deletingExpenseIds = signal<ReadonlySet<string>>(new Set());
  protected readonly participantActionExpenseIds = signal<ReadonlySet<string>>(new Set());
  protected readonly pendingDeleteExpense = signal<ExpenseRow | null>(null);
  protected readonly viewingExpense = signal<ExpenseRow | null>(null);
  protected readonly listStatusMessage = signal('');
  protected readonly statusMessage = signal('');
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly activeCurrentUserId = computed(() => {
    const currentUser = this.authService.currentUser();
    return currentUser?.status === 'active' ? currentUser.id : null;
  });
  protected readonly isEditing = computed(() => this.editingExpenseId() !== null);
  protected readonly editingExpenseSummary = computed(() => {
    const editingId = this.editingExpenseId();
    return editingId ? (this.expenses().find((expense) => expense.id === editingId) ?? null) : null;
  });
  protected readonly hasDeleteFlowPending = computed(
    () => this.pendingDeleteExpense() !== null || this.deletingExpenseIds().size > 0,
  );
  protected readonly activeMemberOptions = computed(() => this.buildActiveMemberOptions());

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
    paidByUserId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    participantUserIds: new FormControl<readonly string[]>([], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
  });

  ngOnInit(): void {
    this.loadMembersFromDatabase();
    this.loadExpensesFromDatabase();
  }

  protected openCreateModal(): void {
    this.viewingExpense.set(null);
    this.editingExpenseId.set(null);
    this.statusMessage.set('');
    this.form.reset({
      title: '',
      amount: null,
      category: 'other',
      expenseDate: new Date().toISOString().slice(0, 10),
      paidByUserId: this.defaultPayerId(),
      participantUserIds: this.defaultParticipantIds(),
      description: '',
    });
    this.isCreateModalOpen.set(true);
    queueMicrotask(() => this.firstExpenseField?.nativeElement.focus());
  }

  protected openEditModal(expense: ExpenseRow): void {
    if (!expense.canEdit || this.hasDeleteFlowPending()) {
      return;
    }

    this.viewingExpense.set(null);
    this.editingExpenseId.set(expense.id);
    this.statusMessage.set('');
    this.form.reset({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      expenseDate: expense.expenseDate,
      paidByUserId: expense.paidById,
      participantUserIds: expense.participantIds,
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
      paidByUserId: this.defaultPayerId(),
      participantUserIds: this.defaultParticipantIds(),
      description: '',
    });
  }

  protected openExpense(expense: ExpenseRow): void {
    if (expense.canEdit) {
      this.openEditModal(expense);
      return;
    }

    this.openViewModal(expense);
  }

  protected openViewModal(expense: ExpenseRow): void {
    if (this.isCreateModalOpen() || this.hasDeleteFlowPending()) {
      return;
    }

    this.viewingExpense.set(expense);
    queueMicrotask(() => this.viewCloseButton?.nativeElement.focus());
  }

  protected closeViewModal(): void {
    this.viewingExpense.set(null);
  }

  protected submitExpense(): void {
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      this.statusMessage.set(
        $localize`:Expense auth required@@expenseAuthRequired:請先登入後再新增支出。`,
      );
      return;
    }

    if (
      this.form.invalid ||
      this.form.controls.amount.value === null ||
      (!this.isEditing() && this.form.controls.participantUserIds.value.length === 0)
    ) {
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
          paidByUserId: formValue.paidByUserId,
          category: formValue.category,
          expenseDate: formValue.expenseDate,
          splitMethod: 'equal',
          participants: formValue.participantUserIds.map((userId) => ({ userId })),
        });

    request$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.closeCreateModal();
        this.loadExpensesFromDatabase();
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

    this.trapModalFocus(event);
  }

  protected handleViewModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeViewModal();
      return;
    }

    this.trapModalFocus(event);
  }

  protected openDeleteModal(expense: ExpenseRow): void {
    if (
      !expense.canDelete ||
      this.isCreateModalOpen() ||
      this.viewingExpense() ||
      this.hasDeleteFlowPending()
    ) {
      return;
    }

    this.listStatusMessage.set('');
    this.pendingDeleteExpense.set(expense);
    queueMicrotask(() => this.deleteCancelButton?.nativeElement.focus());
  }

  protected closeDeleteModal(): void {
    const expense = this.pendingDeleteExpense();
    if (expense && this.deletingExpenseIds().has(expense.id)) {
      return;
    }

    this.pendingDeleteExpense.set(null);
  }

  protected handleDeleteModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeDeleteModal();
      return;
    }

    this.trapModalFocus(event);
  }

  protected deletePendingExpense(): void {
    const expense = this.pendingDeleteExpense();
    if (!expense || this.deletingExpenseIds().has(expense.id)) {
      return;
    }

    this.trackDeletingExpense(expense.id);
    this.listStatusMessage.set('');
    this.expenseApiService.deleteExpense(expense.id).subscribe({
      next: () => {
        this.expenses.update((expenses) =>
          expenses.filter((candidate) => candidate.id !== expense.id),
        );
        this.untrackDeletingExpense(expense.id);
        this.pendingDeleteExpense.set(null);
        if (this.deletingExpenseIds().size === 0) {
          this.loadExpensesFromDatabase();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.untrackDeletingExpense(expense.id);
        this.pendingDeleteExpense.set(null);
        this.listStatusMessage.set(this.formatDeleteError(err));
        if (this.deletingExpenseIds().size === 0) {
          this.loadExpensesFromDatabase();
        }
      },
    });
  }

  protected isExpenseActionDisabled(expenseId: string): boolean {
    return (
      this.hasDeleteFlowPending() ||
      this.deletingExpenseIds().has(expenseId) ||
      this.participantActionExpenseIds().has(expenseId)
    );
  }

  protected canCurrentUserChangeParticipation(): boolean {
    return this.activeCurrentUserId() !== null;
  }

  protected isCurrentUserParticipant(expense: ExpenseRow): boolean {
    const currentUserId = this.activeCurrentUserId();
    return currentUserId !== null && expense.participantIds.includes(currentUserId);
  }

  protected joinExpenseParticipant(expense: ExpenseRow, event: Event): void {
    this.updateExpenseParticipation(expense, 'join', event);
  }

  protected leaveExpenseParticipant(expense: ExpenseRow, event: Event): void {
    this.updateExpenseParticipation(expense, 'leave', event);
  }

  private trapModalFocus(event: KeyboardEvent): void {
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

  private trackDeletingExpense(expenseId: string): void {
    this.deletingExpenseIds.update((ids) => new Set(ids).add(expenseId));
  }

  private untrackDeletingExpense(expenseId: string): void {
    this.deletingExpenseIds.update((ids) => {
      const nextIds = new Set(ids);
      nextIds.delete(expenseId);
      return nextIds;
    });
  }

  private updateExpenseParticipation(
    expense: ExpenseRow,
    action: 'join' | 'leave',
    event: Event,
  ): void {
    event.stopPropagation();

    const currentUserId = this.activeCurrentUserId();
    if (!currentUserId || this.isExpenseActionDisabled(expense.id)) {
      return;
    }

    const isParticipant = expense.participantIds.includes(currentUserId);
    if ((action === 'join' && isParticipant) || (action === 'leave' && !isParticipant)) {
      return;
    }

    this.trackParticipantAction(expense.id);
    this.listStatusMessage.set('');

    const request$: Observable<ExpenseParticipantResponse> =
      action === 'join'
        ? this.expenseApiService.joinExpenseParticipant(expense.id)
        : this.expenseApiService.leaveExpenseParticipant(expense.id);

    request$.subscribe({
      next: (response) => {
        this.replaceExpenseRow(response.expense);
        this.untrackParticipantAction(expense.id);
      },
      error: (err: HttpErrorResponse) => {
        this.untrackParticipantAction(expense.id);
        this.listStatusMessage.set(this.formatParticipantActionError(err));
      },
    });
  }

  private trackParticipantAction(expenseId: string): void {
    this.participantActionExpenseIds.update((ids) => new Set(ids).add(expenseId));
  }

  private untrackParticipantAction(expenseId: string): void {
    this.participantActionExpenseIds.update((ids) => {
      const nextIds = new Set(ids);
      nextIds.delete(expenseId);
      return nextIds;
    });
  }

  private formatSubmitError(error: HttpErrorResponse): string {
    const fallback = $localize`:Expense create failed@@expenseCreateFailed:支出建立失敗，請稍後再試。`;
    const apiError = (error.error as { error?: { message?: string } } | null)?.error;
    return apiError?.message ?? fallback;
  }

  private formatDeleteError(error: HttpErrorResponse): string {
    const fallback = $localize`:Expense delete failed@@expenseDeleteFailed:支出刪除失敗，請稍後再試。`;
    const apiError = (error.error as { error?: { message?: string } } | null)?.error;
    return apiError?.message ?? fallback;
  }

  private formatParticipantActionError(error: HttpErrorResponse): string {
    const fallback = $localize`:Expense participation update failed@@expenseParticipationFailed:無法更新支出參與者，請稍後再試。`;
    const apiError = (error.error as { error?: { message?: string } } | null)?.error;
    return apiError?.message ?? fallback;
  }

  private loadExpensesFromDatabase(): void {
    this.expenseApiService.listExpenses().subscribe({
      next: (response) => {
        this.expenses.set(response.expenses.map((expense) => this.mapExpenseRow(expense)));
      },
      error: () => {
        this.expenses.set([]);
      },
    });
  }

  private loadMembersFromDatabase(): void {
    this.expenseApiService.listMembers().subscribe({
      next: (response) => {
        this.members.set(response.members);
        this.syncCreateMemberDefaults();
      },
      error: () => {
        this.members.set([]);
        this.syncCreateMemberDefaults();
      },
    });
  }

  private mapExpenseRow(expense: ExpenseListItem): ExpenseRow {
    return {
      id: expense.id,
      title: expense.title,
      category: expense.category,
      categoryLabel: this.categoryLabels[expense.category],
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      paidById: expense.paidBy.id,
      paidBy: expense.paidBy.displayName,
      participantIds: expense.participants.map((participant) => participant.userId),
      participantsLabel: expense.participants
        .map((participant) => participant.displayName)
        .join(', '),
      description: expense.description ?? '',
      canEdit: expense.canEdit,
      canDelete: expense.canDelete,
    };
  }

  private replaceExpenseRow(expense: ExpenseListItem): void {
    const row = this.mapExpenseRow(expense);
    const rows = this.expenses();

    if (rows.some((candidate) => candidate.id === row.id)) {
      this.expenses.set(rows.map((candidate) => (candidate.id === row.id ? row : candidate)));
    } else {
      this.loadExpensesFromDatabase();
    }

    if (this.viewingExpense()?.id === row.id) {
      this.viewingExpense.set(row);
    }

    if (this.pendingDeleteExpense()?.id === row.id) {
      this.pendingDeleteExpense.set(row);
    }
  }

  private buildActiveMemberOptions(): readonly MemberListItem[] {
    const membersById = new Map<string, MemberListItem>();

    for (const member of this.members()) {
      if (member.status === 'active') {
        membersById.set(member.userId, member);
      }
    }

    const currentUser = this.authService.currentUser();
    if (currentUser && !membersById.has(currentUser.id)) {
      membersById.set(currentUser.id, {
        userId: currentUser.id,
        displayName: currentUser.displayName ?? currentUser.email ?? currentUser.id,
        role: currentUser.role,
        status: currentUser.status,
        joinedAt: null,
      });
    }

    return [...membersById.values()];
  }

  private defaultPayerId(): string {
    const currentUserId = this.authService.currentUser()?.id;

    if (
      currentUserId &&
      this.activeMemberOptions().some((member) => member.userId === currentUserId)
    ) {
      return currentUserId;
    }

    return this.activeMemberOptions()[0]?.userId ?? '';
  }

  private defaultParticipantIds(): readonly string[] {
    const payerId = this.defaultPayerId();
    return payerId ? [payerId] : [];
  }

  private syncCreateMemberDefaults(): void {
    if (!this.isCreateModalOpen() || this.isEditing()) {
      return;
    }

    if (!this.form.controls.paidByUserId.value) {
      this.form.controls.paidByUserId.setValue(this.defaultPayerId());
    }

    if (this.form.controls.participantUserIds.value.length === 0) {
      this.form.controls.participantUserIds.setValue(this.defaultParticipantIds());
    }
  }

  protected titleInvalid(): boolean {
    const control = this.form.controls.title;
    return control.invalid && (control.dirty || control.touched);
  }

  protected amountInvalid(): boolean {
    const control = this.form.controls.amount;
    return control.invalid && (control.dirty || control.touched);
  }

  protected participantsInvalid(): boolean {
    const control = this.form.controls.participantUserIds;
    return control.value.length === 0 && (control.dirty || control.touched);
  }
}
