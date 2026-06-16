import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { SettlementMember, SettlementSummary } from './settlement-api.service';
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
    flushMemberList();
    flushSummary(createSummary());

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'pending' } });
    flushSummary(
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
    flushMemberList();
    flushSummary(createSummary());

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'confirmed' } });
    flushSummary(createSummary({ suggestedTransfers: [] }));

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
    flushMemberList();
    flushSummary(createSummary());

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'confirmed' } });
    flushSummary(createSummary({ suggestedTransfers: [] }));

    expect(fixture.nativeElement.textContent).toContain('已記錄並確認付款');
  });

  it('records suggested transfers as any active joined member even without a balance row', () => {
    currentUserState.set({
      id: 'usr_carol',
      email: 'carol@example.com',
      displayName: 'Carol',
      role: 'member',
      status: 'active',
    });
    fixture.detectChanges();
    flushMemberList([
      ...createMemberList(),
      {
        userId: 'usr_carol',
        displayName: 'Carol',
        role: 'member',
        status: 'active',
        joinedAt: '2026-06-16 09:03:00',
      },
    ]);
    flushSummary(createSummary());

    clickButton('記錄付款');

    const post = http.expectOne('/api/payments');
    expect(post.request.body).toEqual({
      fromUserId: 'usr_bob',
      toUserId: 'usr_alice',
      amount: 300,
    });
    post.flush({ payment: { id: 'pay_1', status: 'pending' } });
    flushSummary(createSummary());

    expect(fixture.nativeElement.textContent).toContain('已記錄付款');
  });

  it('does not record suggested transfers for callers who are not joined members', () => {
    currentUserState.set({
      id: 'usr_carol',
      email: 'carol@example.com',
      displayName: 'Carol',
      role: 'member',
      status: 'active',
    });
    fixture.detectChanges();
    flushMemberList([
      ...createMemberList(),
      {
        userId: 'usr_carol',
        displayName: 'Carol',
        role: 'member',
        status: 'active',
        joinedAt: null,
      },
    ]);
    flushSummary(
      createSummary({
        balances: [
          { userId: 'usr_alice', displayName: 'Alice', net: 300 },
          { userId: 'usr_bob', displayName: 'Bob', net: -300 },
          { userId: 'usr_carol', displayName: 'Carol', net: 0 },
        ],
      }),
    );

    expect(fixture.nativeElement.textContent).not.toContain('記錄付款');
    (fixture.componentInstance as unknown as { recordTransfer(t: unknown): void }).recordTransfer(
      createSummary().suggestedTransfers[0],
    );
    http.expectNone('/api/payments');
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
    flushMemberList();
    flushSummary(
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

    clickButton('確認付款');

    const patch = http.expectOne('/api/payments/pay_1/confirm');
    expect(patch.request.method).toBe('PATCH');
    patch.flush({ ok: true, payment: { id: 'pay_1' } });
    flushSummary(createSummary({ suggestedTransfers: [] }));

    expect(fixture.nativeElement.textContent).toContain('已確認付款');
  });

  it('surfaces summary load failures', () => {
    fixture.detectChanges();
    flushMemberList();
    http
      .expectOne('/api/settlements/summary')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法載入結算資料');
  });

  it('surfaces member load failures', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/members')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    flushSummary(createSummary());

    expect(fixture.nativeElement.textContent).toContain('無法載入結算成員');
    expect(fixture.nativeElement.textContent).not.toContain('記錄付款');
  });

  it('falls back to zero balance without a current user', () => {
    currentUserState.set(null);
    fixture.detectChanges();
    flushMemberList([]);
    flushSummary(createSummary());

    expect(fixture.nativeElement.textContent).toContain('NT$0');
  });

  it('surfaces record payment failures and avoids duplicate in-flight submissions', () => {
    fixture.detectChanges();
    flushMemberList();
    flushSummary(createSummary());

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
    flushMemberList();
    flushSummary(
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
    flushMemberList();
    flushSummary(
      createSummary({
        pendingPayments: [pendingPayment],
      }),
    );

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
    flushMemberList();
    flushSummary(
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

  function flushMemberList(members: readonly SettlementMember[] = createMemberList()): void {
    const request = http.expectOne('/api/members');
    expect(request.request.method).toBe('GET');
    request.flush({ members });
    fixture.detectChanges();
  }

  function flushSummary(summary: SettlementSummary): void {
    const request = http.expectOne('/api/settlements/summary');
    expect(request.request.method).toBe('GET');
    request.flush(summary);
    fixture.detectChanges();
  }

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

function createMemberList(): readonly SettlementMember[] {
  return [
    {
      userId: 'usr_alice',
      displayName: 'Alice',
      role: 'member',
      status: 'active',
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
