import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { ExpenseListItem } from '../expenses/expense-api.service';
import { SettlementSummary } from '../settlements/settlement-api.service';
import { DashboardPageComponent } from './dashboard-page.component';

describe('DashboardPageComponent', () => {
  const currentUser: CurrentUser = {
    id: 'usr_bob',
    email: 'bob@example.com',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };

  let fixture: ComponentFixture<DashboardPageComponent>;
  let http: HttpTestingController;
  let currentUserState: ReturnType<typeof signal<CurrentUser | null>>;

  beforeEach(async () => {
    currentUserState = signal<CurrentUser | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserState,
          } satisfies Pick<AuthService, 'currentUser'>,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('renders live expense totals, balance, and settlement suggestions', () => {
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http.expectOne('/api/expenses').flush({
      expenses: [
        createExpense({ amount: 600, expenseDate: currentMonthDate() }),
        createExpense({ id: 'exp_previous', amount: 900, expenseDate: '2024-01-01' }),
      ],
      nextCursor: null,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('NT$600');
    expect(text).toContain('NT$-300');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    expect(text).toContain('前往神秘挑戰');
    expect(text).toContain('最近活動');
    expect(text).toContain('2');
  });

  it('surfaces load failures instead of silently keeping stub values', () => {
    fixture.detectChanges();

    http
      .expectOne('/api/settlements/summary')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    http.expectOne('/api/expenses').flush({ expenses: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法載入結算資料');
  });

  it('surfaces expense load failures', () => {
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http
      .expectOne('/api/expenses')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法載入支出資料');
  });

  it('keeps monthly spending value inside a narrow mobile card', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '320px';
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http.expectOne('/api/expenses').flush({
      expenses: [createExpense({ amount: 123_456_789_012, expenseDate: currentMonthDate() })],
      nextCursor: null,
    });
    fixture.detectChanges();

    const monthlyValue = host.querySelector<HTMLElement>('.metric-card__value.money');

    expect(monthlyValue).withContext('monthly spending metric value').not.toBeNull();
    expect(monthlyValue?.scrollWidth ?? 0).toBeLessThanOrEqual(monthlyValue?.clientWidth ?? 0);
  });

  it('falls back to zero member-specific amounts without a current user', () => {
    currentUserState.set(null);
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http.expectOne('/api/expenses').flush({ expenses: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('NT$0');
  });
});

function createSummary(): SettlementSummary {
  return {
    currency: 'TWD',
    balances: [
      { userId: 'usr_alice', displayName: 'Alice', net: 300 },
      { userId: 'usr_bob', displayName: 'Bob', net: -300 },
    ],
    suggestedTransfers: [
      {
        fromUserId: 'usr_bob',
        fromDisplayName: 'Bob',
        toUserId: 'usr_alice',
        toDisplayName: 'Alice',
        amount: 300,
      },
    ],
    pendingPayments: [],
  };
}

function createExpense(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    id: 'exp_current',
    title: 'Shared dinner',
    description: null,
    amount: 600,
    currency: 'TWD',
    category: 'ingredients',
    expenseDate: currentMonthDate(),
    paidBy: {
      id: 'usr_alice',
      displayName: 'Alice',
    },
    participants: [
      { userId: 'usr_alice', displayName: 'Alice', shareAmount: 300 },
      { userId: 'usr_bob', displayName: 'Bob', shareAmount: 300 },
    ],
    canEdit: true,
    canDelete: true,
    ...overrides,
  };
}

function currentMonthDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
