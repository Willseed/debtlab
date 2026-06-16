import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { SettlementSummary } from './settlement-api.service';
import { SettlementsPageComponent } from './settlements-page.component';

describe('SettlementsPageComponent', () => {
  const currentUser: CurrentUser = {
    id: 'usr_bob',
    email: 'bob@example.com',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };

  let fixture: ComponentFixture<SettlementsPageComponent>;
  let http: HttpTestingController;
  let currentUserState: ReturnType<typeof signal<CurrentUser | null>>;

  beforeEach(async () => {
    currentUserState = signal<CurrentUser | null>(currentUser);

    await TestBed.configureTestingModule({
      imports: [SettlementsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUserState,
            isAdmin: computed(() => currentUserState()?.role === 'admin'),
          } satisfies Pick<AuthService, 'currentUser' | 'isAdmin'>,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettlementsPageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('records a suggested transfer as a pending payment for the current sender', () => {
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(createSummary());
    fixture.detectChanges();

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'pending' } });
    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        pendingPayments: [
          {
            id: 'pay_1',
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 300,
            currency: 'TWD',
            note: null,
            createdAt: '2026-06-15 10:00:00',
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('已記錄付款');
    expect(fixture.nativeElement.textContent).toContain('等待確認');
  });

  it('records and confirms a suggested transfer when the current user is the receiver', () => {
    currentUserState.set({
      id: 'usr_alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      role: 'member',
      status: 'active',
    });
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(createSummary());
    fixture.detectChanges();

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'confirmed' } });
    http.expectOne('/api/settlements/summary').flush(createSummary({ suggestedTransfers: [] }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('已記錄並確認付款');
  });

  it('records and confirms suggested transfers as an admin even when not a payment party', () => {
    currentUserState.set({
      id: 'usr_admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      role: 'admin',
      status: 'active',
    });
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(createSummary());
    fixture.detectChanges();

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'confirmed' } });
    http.expectOne('/api/settlements/summary').flush(createSummary({ suggestedTransfers: [] }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('已記錄並確認付款');
  });

  it('confirms pending payments when the current user is the receiver', () => {
    currentUserState.set({
      id: 'usr_alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      role: 'member',
      status: 'active',
    });
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        suggestedTransfers: [],
        pendingPayments: [
          {
            id: 'pay_1',
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 300,
            currency: 'TWD',
            note: null,
            createdAt: '2026-06-15 10:00:00',
          },
        ],
      }),
    );
    fixture.detectChanges();

    clickButton('確認付款');

    const patch = http.expectOne('/api/payments/pay_1/confirm');
    expect(patch.request.method).toBe('PATCH');
    patch.flush({ ok: true, payment: { id: 'pay_1' } });
    http.expectOne('/api/settlements/summary').flush(createSummary({ suggestedTransfers: [] }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('已確認付款');
  });

  it('surfaces summary load failures', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/settlements/summary')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法載入結算資料');
  });

  it('falls back to zero balance without a current user', () => {
    currentUserState.set(null);
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(createSummary());
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('NT$0');
  });

  it('surfaces record payment failures and avoids duplicate in-flight submissions', () => {
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(createSummary());
    fixture.detectChanges();

    clickButton('記錄付款');
    (fixture.componentInstance as unknown as { recordTransfer(t: unknown): void }).recordTransfer(
      createSummary().suggestedTransfers[0],
    );
    const requests = http.match('/api/payments');
    expect(requests.length).toBe(1);

    requests[0].flush(
      { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法記錄付款');
  });

  it('blocks duplicate pending payments in the same direction even when amounts differ', () => {
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        suggestedTransfers: [
          {
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 350,
          },
        ],
        pendingPayments: [
          {
            id: 'pay_1',
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 300,
            currency: 'TWD',
            note: null,
            createdAt: '2026-06-15 10:00:00',
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('等待確認');
    expect(fixture.nativeElement.textContent).not.toContain('記錄付款');
  });

  it('does not confirm payments for users who are neither receiver nor admin', () => {
    const pendingPayment = {
      id: 'pay_1',
      fromUserId: 'usr_alice',
      fromDisplayName: 'Alice',
      toUserId: 'usr_carol',
      toDisplayName: 'Carol',
      amount: 300,
      currency: 'TWD' as const,
      note: null,
      createdAt: '2026-06-15 10:00:00',
    };

    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        pendingPayments: [pendingPayment],
      }),
    );
    fixture.detectChanges();

    (
      fixture.componentInstance as unknown as { confirmPayment(payment: unknown): void }
    ).confirmPayment(pendingPayment);

    expect(fixture.nativeElement.textContent).toContain('Carol');
    http.expectNone('/api/payments/pay_1/confirm');
  });

  it('surfaces confirm payment failures', () => {
    currentUserState.set({
      id: 'usr_alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      role: 'member',
      status: 'active',
    });
    fixture.detectChanges();
    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        suggestedTransfers: [],
        pendingPayments: [
          {
            id: 'pay_1',
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 300,
            currency: 'TWD',
            note: null,
            createdAt: '2026-06-15 10:00:00',
          },
        ],
      }),
    );
    fixture.detectChanges();

    clickButton('確認付款');

    http
      .expectOne('/api/payments/pay_1/confirm')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法確認付款');
  });
});

function clickButton(label: string): void {
  const buttons = Array.from(document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
  const button = buttons.find((candidate) => candidate.textContent?.includes(label));
  expect(button).withContext(`button ${label}`).toBeTruthy();
  button?.click();
}

function createSummary(overrides: Partial<SettlementSummary> = {}): SettlementSummary {
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
    ...overrides,
  };
}
