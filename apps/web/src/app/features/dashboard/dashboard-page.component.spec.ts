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

  it('declares explicit dashboard metric grid behavior across desktop, tablet, and mobile', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1332px';
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http.expectOne('/api/expenses').flush({ expenses: [], nextCursor: null });
    fixture.detectChanges();

    const grid = host.querySelector<HTMLElement>('.metric-grid');
    expect(grid).withContext('dashboard metric grid').not.toBeNull();
    if (!grid) return;

    const gridStyle = getComputedStyle(grid);
    expect(gridStyle.display).withContext('metric grid display').toBe('grid');
    expect(gridStyle.gap).withContext('metric grid gap').toBe('16px');

    expect(
      normalizeGridTemplate(
        findStyleRule('.metric-grid', 'grid-template-columns').style.getPropertyValue(
          'grid-template-columns',
        ),
      ),
    )
      .withContext('desktop grid template')
      .toBe('repeat(4, minmax(0, 1fr))');
    expect(
      normalizeGridTemplate(
        findStyleRule(
          '.metric-grid',
          'grid-template-columns',
          '(max-width: 1024px)',
        ).style.getPropertyValue('grid-template-columns'),
      ),
    )
      .withContext('tablet grid template')
      .toBe('repeat(2, minmax(0, 1fr))');
    expect(
      normalizeGridTemplate(
        findStyleRule(
          '.metric-grid',
          'grid-template-columns',
          '(max-width: 640px)',
        ).style.getPropertyValue('grid-template-columns'),
      ),
    )
      .withContext('mobile grid template')
      .toBe('1fr');
  });

  it('sizes metric cards and values from the layout root instead of a one-off money font tweak', () => {
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(createSummary());
    http.expectOne('/api/expenses').flush({ expenses: [], nextCursor: null });
    fixture.detectChanges();

    const card = host.querySelector<HTMLElement>('.metric-card');
    const value = host.querySelector<HTMLElement>('.metric-card__value');
    expect(card).withContext('metric card').not.toBeNull();
    expect(value).withContext('metric value').not.toBeNull();
    if (!card || !value) return;

    const cardStyle = getComputedStyle(card);
    const valueStyle = getComputedStyle(value);
    expect(cardStyle.minWidth).withContext('metric card min width').toBe('0px');
    expect(cardStyle.boxSizing).withContext('metric card box sizing').toBe('border-box');
    expect(cardStyle.containerType).withContext('metric card query container').toBe('inline-size');
    expect(cardStyle.overflow).withContext('metric card overflow').toBe('visible');
    expect(valueStyle.overflowX).withContext('metric value horizontal overflow').toBe('auto');
    expect(valueStyle.whiteSpace).withContext('metric value wrapping').toBe('nowrap');
    expect(valueStyle.maxWidth).withContext('metric value max width').toBe('100%');
    expect(findStyleRule('.metric-card__value', 'font-size').style.getPropertyValue('font-size'))
      .withContext('metric value clamp font sizing')
      .toBe('clamp(28px, 4vw, 52px)');
    expect(
      findStyleRule('.metric-card__value', 'line-height').style.getPropertyValue('line-height'),
    )
      .withContext('metric value line height')
      .toBe('1.1');
  });

  it('keeps screenshot-sized desktop TWD metrics inside a four-column grid', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1332px';
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        balances: [{ userId: 'usr_bob', displayName: 'Bob', net: -15_910 }],
        suggestedTransfers: [
          {
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 15_910,
          },
        ],
      }),
    );
    http.expectOne('/api/expenses').flush({
      expenses: [createExpense({ amount: 31_820, expenseDate: currentMonthDate() })],
      nextCursor: null,
    });
    fixture.detectChanges();

    const grid = host.querySelector<HTMLElement>('.metric-grid');
    expect(grid).withContext('desktop metric grid').not.toBeNull();
    if (!grid) return;

    const gridColumns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
    expect(gridColumns.length)
      .withContext('active metric columns should not collapse to one')
      .toBeGreaterThan(1);
    expect(
      normalizeGridTemplate(
        findStyleRule('.metric-grid', 'grid-template-columns').style.getPropertyValue(
          'grid-template-columns',
        ),
      ),
    )
      .withContext('desktop four-column grid rule')
      .toBe('repeat(4, minmax(0, 1fr))');

    const moneyValues = Array.from(host.querySelectorAll<HTMLElement>('.metric-card__value.money'));
    expect(moneyValues.map((value) => value.textContent?.trim())).toEqual([
      'NT$31820',
      'NT$-15910',
      'NT$15910',
    ]);

    for (const value of moneyValues) {
      const card = value.closest<HTMLElement>('.metric-card');
      expect(card)
        .withContext(`${value.textContent ?? 'money value'} card`)
        .not.toBeNull();
      if (!card) return;

      const valueRect = value.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      expect(value.scrollWidth)
        .withContext(`${value.textContent ?? 'money value'} should fit its value box`)
        .toBeLessThanOrEqual(value.clientWidth);
      expect(valueRect.right)
        .withContext(`${value.textContent ?? 'money value'} should stay inside its card`)
        .toBeLessThanOrEqual(cardRect.right);
    }
  });

  it('contains unusually large TWD values inside their cards without overlapping neighbors', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    host.style.width = '1332px';
    fixture.detectChanges();

    http.expectOne('/api/settlements/summary').flush(
      createSummary({
        balances: [{ userId: 'usr_bob', displayName: 'Bob', net: -1_234_567_890_123 }],
        suggestedTransfers: [
          {
            fromUserId: 'usr_bob',
            fromDisplayName: 'Bob',
            toUserId: 'usr_alice',
            toDisplayName: 'Alice',
            amount: 1_234_567_890_123,
          },
        ],
      }),
    );
    http.expectOne('/api/expenses').flush({
      expenses: [createExpense({ amount: 1_234_567_890_123, expenseDate: currentMonthDate() })],
      nextCursor: null,
    });
    fixture.detectChanges();

    const cards = Array.from(host.querySelectorAll<HTMLElement>('.metric-card'));
    const moneyValues = Array.from(host.querySelectorAll<HTMLElement>('.metric-card__value.money'));
    expect(moneyValues.length).withContext('money metric count').toBe(3);

    for (const value of moneyValues) {
      const card = value.closest<HTMLElement>('.metric-card');
      expect(card)
        .withContext(`${value.textContent ?? 'money value'} card`)
        .not.toBeNull();
      if (!card) return;

      const valueRect = value.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      expect(valueRect.left)
        .withContext(`${value.textContent ?? 'money value'} should start inside its card`)
        .toBeGreaterThanOrEqual(cardRect.left);
      expect(valueRect.right)
        .withContext(
          `${value.textContent ?? 'money value'} scroll container should stay inside its card`,
        )
        .toBeLessThanOrEqual(cardRect.right);
    }

    for (let index = 1; index < cards.length; index += 1) {
      const currentRect = cards[index].getBoundingClientRect();
      const previousRect = cards[index - 1].getBoundingClientRect();
      if (Math.abs(currentRect.top - previousRect.top) > 1) continue;

      expect(currentRect.left)
        .withContext(`card ${index} should not overlap previous card`)
        .toBeGreaterThanOrEqual(previousRect.right);
    }
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

function findStyleRule(selector: string, property: string, mediaText?: string): CSSStyleRule {
  let found: CSSStyleRule | null = null;

  for (const styleSheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = styleSheet.cssRules;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        continue;
      }
      throw error;
    }

    const match = findStyleRuleInList(rules, selector, property, mediaText);
    if (!match) continue;
    if (!found || !found.selectorText.includes(`${selector}[_ngcontent`)) {
      found = match;
    }
  }

  if (found) return found;
  throw new Error(`Missing CSS rule for ${selector} with ${property}`);
}

function findStyleRuleInList(
  rules: CSSRuleList,
  selector: string,
  property: string,
  mediaText?: string,
): CSSStyleRule | null {
  let found: CSSStyleRule | null = null;
  let foundScoped: CSSStyleRule | null = null;

  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (!mediaText || rule.conditionText !== mediaText) continue;
      const match = findStyleRuleInList(rule.cssRules, selector, property);
      found = match ?? found;
      continue;
    }

    if (mediaText || !(rule instanceof CSSStyleRule)) continue;
    if (rule.selectorText.includes(selector) && rule.style.getPropertyValue(property)) {
      found = rule;
      if (rule.selectorText.includes(`${selector}[_ngcontent`)) {
        foundScoped = rule;
      }
    }
  }

  return foundScoped ?? found;
}

function normalizeGridTemplate(value: string): string {
  return value.replaceAll('0px', '0');
}
