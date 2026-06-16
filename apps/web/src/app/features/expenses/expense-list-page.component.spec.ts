import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { ExpenseListItem, MemberListItem } from './expense-api.service';
import { ExpenseListPageComponent } from './expense-list-page.component';

function createExpenseRow(expense: ExpenseListItem): unknown {
  return {
    id: expense.id,
    title: expense.title,
    category: expense.category,
    categoryLabel: '食材',
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    paidById: expense.paidBy.id,
    paidBy: expense.paidBy.displayName,
    participantIds: expense.participants.map((participant) => participant.userId),
    participantsLabel: expense.participants
      .map((participant) => participant.displayName)
      .join(', '),
    description: expense.description ?? '',
    participantLocked: expense.participantLocked ?? false,
    canLockParticipants: expense.canLockParticipants ?? null,
    canUnlockParticipants: expense.canUnlockParticipants ?? null,
    canJoinParticipants: expense.canJoinParticipants ?? null,
    canLeaveParticipants: expense.canLeaveParticipants ?? null,
    canEdit: expense.canEdit,
    canDelete: expense.canDelete,
  };
}

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
    flushMemberList();
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
    setMultiSelectValues('select[formcontrolname="participantUserIds"]', []);
    clickButton('儲存');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('請輸入 1 到 120 個字的標題。');
    expect(fixture.nativeElement.textContent).toContain('金額必須是正整數。');
    expect(fixture.nativeElement.textContent).toContain('請至少選取一位參與者。');
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

  it('submits an equal split expense for a selected payer and multiple participants', () => {
    clickButton('新增支出');
    fixture.detectChanges();

    setInputValue('input[formcontrolname="title"]', 'Team Dinner');
    setInputValue('input[formcontrolname="amount"]', '2400');
    setInputValue('input[formcontrolname="expenseDate"]', '2026-06-14');
    setSelectValue('select[formcontrolname="category"]', 'other');
    setSelectValue('select[formcontrolname="paidByUserId"]', 'usr_bob');
    setMultiSelectValues('select[formcontrolname="participantUserIds"]', ['usr_member', 'usr_bob']);
    setFormMemberValues('usr_bob', ['usr_member', 'usr_bob']);
    clickButton('儲存');

    const request = http.expectOne('/api/expenses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Team Dinner',
      description: undefined,
      amount: 2400,
      currency: 'TWD',
      paidByUserId: 'usr_bob',
      category: 'other',
      expenseDate: '2026-06-14',
      splitMethod: 'equal',
      participants: [{ userId: 'usr_member' }, { userId: 'usr_bob' }],
    });

    request.flush({ expense: { id: 'exp_team' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_team',
        title: 'Team Dinner',
        amount: 2400,
        paidBy: { id: 'usr_bob', displayName: 'Bob' },
        participants: [
          { userId: 'usr_member', displayName: currentUser.displayName, shareAmount: 1200 },
          { userId: 'usr_bob', displayName: 'Bob', shareAmount: 1200 },
        ],
        canEdit: false,
        canDelete: false,
      }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Team Dinner');
    expect(fixture.nativeElement.textContent).toContain('Bob');
    expect(fixture.nativeElement.textContent).toContain('Member User, Bob');
  });

  it('uses current-user fallback labels when the member list cannot load', () => {
    expectFallbackMemberLabel(
      {
        id: 'usr_named_fallback',
        email: 'named@example.com',
        displayName: 'Named Fallback',
        role: 'member',
        status: 'active',
      },
      'Named Fallback',
    );
    expectFallbackMemberLabel(
      {
        id: 'usr_email_fallback',
        email: 'email@example.com',
        role: 'member',
        status: 'active',
      } as CurrentUser,
      'email@example.com',
    );
    expectFallbackMemberLabel(
      {
        id: 'usr_id_fallback',
        role: 'member',
        status: 'active',
      } as CurrentUser,
      'usr_id_fallback',
    );
  });

  it('fills empty payer and participant defaults when members arrive after the modal opens', () => {
    currentUserState.set(null);
    recreateComponent();
    flushExpenseList();

    clickButton('新增支出');
    fixture.detectChanges();

    expect(
      (
        fixture.nativeElement.querySelector(
          'select[formcontrolname="paidByUserId"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe('');

    flushMemberList([
      {
        userId: 'usr_late_member',
        displayName: 'Late Member',
      },
    ]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      readonly form: {
        readonly controls: {
          readonly paidByUserId: { readonly value: string };
          readonly participantUserIds: { readonly value: readonly string[] };
        };
      };
    };
    expect(component.form.controls.paidByUserId.value).toBe('usr_late_member');
    expect(component.form.controls.participantUserIds.value).toEqual(['usr_late_member']);
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

    findIconButton('編輯支出')?.click();
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

  it('renders localized participant lock controls for payers', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_lock_control',
        canLockParticipants: true,
      }),
    ]);

    const lockButton = findIconButton('鎖定參與者');

    expect(lockButton?.querySelector('svg')).not.toBeNull();
    expect(lockButton?.textContent?.trim()).toBe('');
    expect(lockButton?.title).toBe('鎖定參與者');
    expect(fixture.nativeElement.textContent).not.toContain('加入已關閉');
  });

  it('hides join and shows locked status for locked nonparticipant expenses', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_locked_join',
        paidBy: {
          id: 'usr_bob',
          displayName: 'Bob',
        },
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 1280,
          },
        ],
        participantLocked: true,
        canJoinParticipants: false,
        canEdit: false,
        canDelete: false,
      }),
    ]);

    expect(findIconButton('加入支出')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('加入已關閉');

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('加入狀態');
    expect(fixture.nativeElement.textContent).toContain('加入已關閉');
  });

  it('hides join when the backend marks joining unavailable', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_settled_join_closed',
        paidBy: {
          id: 'usr_bob',
          displayName: 'Bob',
        },
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 1280,
          },
        ],
        canJoinParticipants: false,
        canEdit: false,
        canDelete: false,
      }),
    ]);

    expect(findIconButton('加入支出')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('加入已關閉');
  });

  it('hides exit when the backend marks leaving unavailable', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_settled_leave_closed',
        canLeaveParticipants: false,
      }),
    ]);

    expect(findIconButton('退出支出')).toBeNull();
    expect(findIconButton('加入支出')).toBeNull();
  });

  it('locks and unlocks expense participants through row replacement', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_lock_flow',
        canLockParticipants: true,
        canUnlockParticipants: false,
      }),
    ]);

    findIconButton('鎖定參與者')?.click();
    fixture.detectChanges();

    const lockRequest = http.expectOne('/api/expenses/exp_lock_flow/participant-lock');
    expect(lockRequest.request.method).toBe('PUT');
    expect(lockRequest.request.body).toBeNull();
    expect(findIconButton('鎖定參與者')?.disabled).toBeTrue();
    expect(findIconButton('編輯支出')?.disabled).toBeTrue();

    lockRequest.flush({
      expense: createExpenseItem({
        id: 'exp_lock_flow',
        participantLocked: true,
        canLockParticipants: false,
        canUnlockParticipants: true,
        canJoinParticipants: false,
      }),
    });
    fixture.detectChanges();

    expect(findIconButton('鎖定參與者')).toBeNull();
    expect(findIconButton('解除參與者鎖定')?.querySelector('svg')).not.toBeNull();
    expect(participantsCellText()).toContain('加入已關閉');

    findIconButton('解除參與者鎖定')?.click();
    fixture.detectChanges();

    const unlockRequest = http.expectOne('/api/expenses/exp_lock_flow/participant-lock');
    expect(unlockRequest.request.method).toBe('DELETE');
    expect(findIconButton('解除參與者鎖定')?.disabled).toBeTrue();

    unlockRequest.flush({
      expense: createExpenseItem({
        id: 'exp_lock_flow',
        participantLocked: false,
        canLockParticipants: true,
        canUnlockParticipants: false,
        canJoinParticipants: true,
      }),
    });
    fixture.detectChanges();

    expect(findIconButton('解除參與者鎖定')).toBeNull();
    expect(findIconButton('鎖定參與者')?.querySelector('svg')).not.toBeNull();
    expect(participantsCellText()).not.toContain('加入已關閉');
  });

  it('surfaces participant lock API errors in the list status area', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_lock_error',
        canLockParticipants: true,
      }),
    ]);

    findIconButton('鎖定參與者')?.click();
    http.expectOne('/api/expenses/exp_lock_error/participant-lock').flush(
      {
        error: {
          code: 'EXPENSE_PARTICIPANT_LOCK_FAILED',
          message: 'Locking participants failed.',
          details: {},
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Locking participants failed.');
    expect(findIconButton('鎖定參與者')?.disabled).toBeFalse();
  });

  it('falls back to a generic message when participant lock updates fail without an API message', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_lock_network',
        canLockParticipants: true,
      }),
    ]);

    findIconButton('鎖定參與者')?.click();
    http
      .expectOne('/api/expenses/exp_lock_network/participant-lock')
      .error(new ProgressEvent('error'), {
        status: 0,
        statusText: 'Network Error',
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法更新加入鎖定，請稍後再試。');
    expect(findIconButton('鎖定參與者')?.disabled).toBeFalse();
  });

  it('skips participant lock requests when the current row no longer matches the action', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_guard_locked',
        participantLocked: true,
        canLockParticipants: false,
        canUnlockParticipants: true,
      }),
      createExpenseItem({
        id: 'exp_guard_unlocked',
        participantLocked: false,
        canLockParticipants: true,
        canUnlockParticipants: false,
      }),
    ]);

    const staleUnlockedExpense = createExpenseRow(
      createExpenseItem({
        id: 'exp_guard_locked',
        participantLocked: false,
        canLockParticipants: true,
        canUnlockParticipants: false,
      }),
    );
    const staleLockedExpense = createExpenseRow(
      createExpenseItem({
        id: 'exp_guard_unlocked',
        participantLocked: true,
        canLockParticipants: false,
        canUnlockParticipants: true,
      }),
    );

    invokeComponentMethod('lockExpenseParticipants', staleUnlockedExpense, new Event('click'));
    invokeComponentMethod('unlockExpenseParticipants', staleLockedExpense, new Event('click'));

    http.expectNone('/api/expenses/exp_guard_locked/participant-lock');
    http.expectNone('/api/expenses/exp_guard_unlocked/participant-lock');
  });

  it('renders an icon-only join action for active nonparticipants and updates the row', () => {
    const bobOnlyExpense = createExpenseItem({
      id: 'exp_join',
      paidBy: {
        id: 'usr_bob',
        displayName: 'Bob',
      },
      participants: [
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 1280,
        },
      ],
      canEdit: false,
      canDelete: false,
    });
    recreateComponent();
    flushMemberList();
    flushExpenseList([bobOnlyExpense]);

    const joinButton = findIconButton('加入支出');
    expect(joinButton?.querySelector('svg')).not.toBeNull();
    expect(joinButton?.textContent?.trim()).toBe('');

    joinButton?.click();
    fixture.detectChanges();

    const request = http.expectOne('/api/expenses/exp_join/participants/me');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeNull();
    expect(findIconButton('加入支出')?.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('支出明細');

    request.flush({
      expense: createExpenseItem({
        ...bobOnlyExpense,
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 640,
          },
          {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            shareAmount: 640,
          },
        ],
      }),
    });
    fixture.detectChanges();

    expect(findIconButton('加入支出')).toBeNull();
    expect(findIconButton('退出支出')?.querySelector('svg')).not.toBeNull();
    expect(participantsCellText()).toBe('Bob, Member User');
  });

  it('renders an exit icon for current participants and disables row actions while pending', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([createExpenseItem({ id: 'exp_leave' })]);

    const leaveButton = findIconButton('退出支出');
    expect(leaveButton?.querySelector('svg')).not.toBeNull();

    leaveButton?.click();
    fixture.detectChanges();

    const request = http.expectOne('/api/expenses/exp_leave/participants/me');
    expect(request.request.method).toBe('DELETE');
    expect(findIconButton('退出支出')?.disabled).toBeTrue();
    expect(findIconButton('編輯支出')?.disabled).toBeTrue();
    expect(findIconButton('刪除支出')?.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('LabSplit Entry');

    request.flush({
      expense: createExpenseItem({
        id: 'exp_leave',
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 1280,
          },
        ],
      }),
    });
    fixture.detectChanges();

    expect(findIconButton('退出支出')).toBeNull();
    expect(findIconButton('加入支出')?.querySelector('svg')).not.toBeNull();
    expect(findIconButton('編輯支出')?.disabled).toBeFalse();
    expect(findIconButton('刪除支出')?.disabled).toBeFalse();
    expect(participantsCellText()).toBe('Bob');
  });

  it('surfaces API participation errors in the list status area', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_join_conflict',
        paidBy: {
          id: 'usr_bob',
          displayName: 'Bob',
        },
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 1280,
          },
        ],
        canEdit: false,
        canDelete: false,
      }),
    ]);

    findIconButton('加入支出')?.click();
    http.expectOne('/api/expenses/exp_join_conflict/participants/me').flush(
      {
        error: {
          code: 'EXPENSE_PARTICIPANT_CONFLICT',
          message: 'You cannot join this expense.',
          details: {},
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You cannot join this expense.');
    expect(findIconButton('加入支出')?.disabled).toBeFalse();
  });

  it('falls back to a generic message when participation updates fail without an API message', () => {
    recreateComponent();
    flushMemberList();
    flushExpenseList([createExpenseItem({ id: 'exp_leave_network' })]);

    findIconButton('退出支出')?.click();
    http
      .expectOne('/api/expenses/exp_leave_network/participants/me')
      .error(new ProgressEvent('error'), {
        status: 0,
        statusText: 'Network Error',
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法更新支出參與者，請稍後再試。');
    expect(findIconButton('退出支出')?.disabled).toBeFalse();
  });

  it('hides participant join and exit actions when the current user is not active', () => {
    currentUserState.set({
      ...currentUser,
      status: 'disabled',
    });
    recreateComponent();
    flushMemberList();
    flushExpenseList([
      createExpenseItem({
        id: 'exp_disabled_user',
        paidBy: {
          id: 'usr_bob',
          displayName: 'Bob',
        },
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 1280,
          },
        ],
        canEdit: false,
        canDelete: false,
      }),
    ]);

    expect(findIconButton('加入支出')).toBeNull();
    expect(findIconButton('退出支出')).toBeNull();
  });

  it('skips participant requests when the current state no longer matches the action', () => {
    const bobOnlyExpense = createExpenseItem({
      id: 'exp_guard_nonparticipant',
      paidBy: {
        id: 'usr_bob',
        displayName: 'Bob',
      },
      participants: [
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 1280,
        },
      ],
      canEdit: false,
      canDelete: false,
    });
    recreateComponent();
    flushMemberList();
    flushExpenseList([createExpenseItem({ id: 'exp_guard_participant' }), bobOnlyExpense]);

    const participantExpense = createExpenseRow(createExpenseItem({ id: 'exp_guard_participant' }));
    const nonParticipantExpense = createExpenseRow(bobOnlyExpense);

    currentUserState.set(null);
    invokeComponentMethod('joinExpenseParticipant', nonParticipantExpense, new Event('click'));
    http.expectNone('/api/expenses/exp_guard_nonparticipant/participants/me');

    currentUserState.set(currentUser);
    invokeComponentMethod('joinExpenseParticipant', participantExpense, new Event('click'));
    invokeComponentMethod('leaveExpenseParticipant', nonParticipantExpense, new Event('click'));

    http.expectNone('/api/expenses/exp_guard_participant/participants/me');
    http.expectNone('/api/expenses/exp_guard_nonparticipant/participants/me');
  });

  it('reloads expenses when a participant update returns an unknown row id', () => {
    const bobOnlyExpense = createExpenseItem({
      id: 'exp_join_reload',
      paidBy: {
        id: 'usr_bob',
        displayName: 'Bob',
      },
      participants: [
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 1280,
        },
      ],
      canEdit: false,
      canDelete: false,
    });
    const returnedExpense = createExpenseItem({
      ...bobOnlyExpense,
      id: 'exp_join_reloaded',
      participants: [
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 640,
        },
        {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          shareAmount: 640,
        },
      ],
    });
    recreateComponent();
    flushMemberList();
    flushExpenseList([bobOnlyExpense]);

    findIconButton('加入支出')?.click();
    http
      .expectOne('/api/expenses/exp_join_reload/participants/me')
      .flush({ expense: returnedExpense });
    flushExpenseList([returnedExpense]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bob, Member User');
  });

  it('keeps open expense detail and delete state synchronized after row replacement', () => {
    const bobOnlyExpense = createExpenseItem({
      id: 'exp_detail_join',
      paidBy: {
        id: 'usr_bob',
        displayName: 'Bob',
      },
      participants: [
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 1280,
        },
      ],
      canEdit: false,
      canDelete: false,
    });
    recreateComponent();
    flushMemberList();
    flushExpenseList([bobOnlyExpense]);

    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();
    findIconButton('加入支出')?.click();
    http.expectOne('/api/expenses/exp_detail_join/participants/me').flush({
      expense: createExpenseItem({
        ...bobOnlyExpense,
        participants: [
          {
            userId: 'usr_bob',
            displayName: 'Bob',
            shareAmount: 640,
          },
          {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            shareAmount: 640,
          },
        ],
      }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('支出明細');
    expect(fixture.nativeElement.textContent).toContain('Bob, Member User');

    closeVisibleDialog();
    recreateComponent();
    flushMemberList();
    flushExpenseList([createExpenseItem({ id: 'exp_pending_replace' })]);
    clickDeleteIcon();
    fixture.detectChanges();
    invokeComponentMethod(
      'replaceExpenseRow',
      createExpenseItem({ id: 'exp_pending_replace', title: 'Updated Beans' }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Updated Beans');
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
    (fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('支出明細');
    http.expectNone('/api/expenses/exp_readonly');
  });

  it('keeps read-only expense details closed while the create modal is open', () => {
    clickButton('新增支出');
    fixture.detectChanges();
    fillValidExpense();
    clickButton('儲存');
    http.expectOne('/api/expenses').flush({ expense: { id: 'exp_readonly_guard' } });
    flushExpenseList([
      createExpenseItem({
        id: 'exp_readonly_guard',
        canEdit: false,
        canDelete: false,
      }),
    ]);
    fixture.detectChanges();

    clickButton('新增支出');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('tr.expense-row') as HTMLTableRowElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('LabSplit Entry');
    expect(fixture.nativeElement.textContent).not.toContain('支出明細');
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

  function recreateComponent(): void {
    fixture.destroy();
    fixture = TestBed.createComponent(ExpenseListPageComponent);
    fixture.detectChanges();
  }

  function expectFallbackMemberLabel(user: CurrentUser, expectedLabel: string): void {
    currentUserState.set(user);
    recreateComponent();
    http.expectOne('/api/members').error(new ProgressEvent('error'), {
      status: 0,
      statusText: 'Network Error',
    });
    flushExpenseList();

    clickButton('新增支出');
    fixture.detectChanges();

    const payerOptions = Array.from(
      (
        fixture.nativeElement.querySelector(
          'select[formcontrolname="paidByUserId"]',
        ) as HTMLSelectElement
      ).options,
    ).map((option) => option.textContent?.trim());

    expect(payerOptions).toContain(expectedLabel);
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

  function closeVisibleDialog(): void {
    (fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
  }

  function invokeComponentMethod(name: string, ...args: readonly unknown[]): void {
    const method: unknown = Object.getPrototypeOf(fixture.componentInstance)[name];

    if (typeof method !== 'function') {
      throw new TypeError(`Component method not found: ${name}`);
    }

    Reflect.apply(method, fixture.componentInstance, args);
  }

  function findIconButton(label: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(
      `button[aria-label="${label}"]`,
    ) as HTMLButtonElement | null;
  }

  function participantsCellText(): string {
    const cell = fixture.nativeElement.querySelector(
      'tr.expense-row td:nth-child(6)',
    ) as HTMLTableCellElement;
    return cell.textContent?.trim() ?? '';
  }

  function setInputValue(selector: string, value: string): void {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setSelectValue(selector: string, value: string): void {
    const select = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setMultiSelectValues(selector: string, values: readonly string[]): void {
    const select = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
    for (const option of Array.from(select.options)) {
      option.selected = values.includes(option.value);
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setFormMemberValues(paidByUserId: string, participantUserIds: readonly string[]): void {
    const component = fixture.componentInstance as unknown as {
      readonly form: {
        readonly controls: {
          readonly paidByUserId: { setValue(value: string): void };
          readonly participantUserIds: { setValue(value: readonly string[]): void };
        };
      };
    };
    component.form.controls.paidByUserId.setValue(paidByUserId);
    component.form.controls.participantUserIds.setValue(participantUserIds);
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

  function flushMemberList(members: readonly MemberListItem[] = createMemberList()): void {
    const request = http.expectOne('/api/members');
    expect(request.request.method).toBe('GET');
    request.flush({ members });
    fixture.detectChanges();
  }

  function createMemberList(): readonly MemberListItem[] {
    return [
      {
        userId: currentUser.id,
        displayName: currentUser.displayName,
        role: currentUser.role,
        status: currentUser.status,
        joinedAt: '2026-06-16 09:00:00',
      },
      {
        userId: 'usr_bob',
        displayName: 'Bob',
        role: 'member',
        status: 'active',
        joinedAt: '2026-06-16 09:01:00',
      },
    ];
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
