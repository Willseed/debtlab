import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ExpenseApiService, ExpenseListItem } from '../expenses/expense-api.service';
import {
  SettlementApiService,
  SettlementSummary,
  SuggestedTransfer,
} from '../settlements/settlement-api.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="dashboard-title">
      <div class="page-section__inner">
        <h1 id="dashboard-title" class="heading-section" i18n="Dashboard title@@dashboardTitle">
          儀表板
        </h1>

        <div class="button-row">
          <a
            class="button button--secondary"
            routerLink="/mystery-challenge"
            i18n="Dashboard mystery challenge link@@dashboardMysteryChallengeLink"
          >
            前往神秘挑戰
          </a>
        </div>

        <div
          class="metric-grid"
          aria-label="儀表板指標"
          i18n-aria-label="Dashboard metrics group@@dashboardMetrics"
        >
          <article class="metric-card">
            <p class="metric-card__label" i18n="This month card@@dashboardThisMonth">本月支出</p>
            <p class="metric-card__value money">NT&#36;{{ thisMonthTotal() }}</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Balance card@@dashboardYourBalance">你的餘額</p>
            <p class="metric-card__value money">NT&#36;{{ myBalance() }}</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Action card@@dashboardActionRequired">待處理</p>
            <p class="metric-card__value money">NT&#36;{{ actionRequiredAmount() }}</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Activity card@@dashboardRecentActivity">最近活動</p>
            <p class="metric-card__value">{{ recentActivityCount() }}</p>
          </article>
        </div>

        @if (statusMessage()) {
          <p class="field__error" role="status">{{ statusMessage() }}</p>
        }

        <section class="panel" aria-labelledby="dashboard-settlement-title">
          <h2
            id="dashboard-settlement-title"
            i18n="Dashboard settlement suggestions@@dashboardSettlementSuggestions"
          >
            結算建議
          </h2>
          @if (suggestedTransfers().length === 0) {
            <p class="muted" i18n="Dashboard empty state@@dashboardNoRecentActivity">
              目前沒有需要結算的支出。
            </p>
          } @else {
            <ul class="transfer-list">
              @for (t of suggestedTransfers(); track t.fromUserId + t.toUserId) {
                <li class="transfer-list__item">
                  <span>{{ t.fromDisplayName }}</span>
                  <span i18n="Transfer arrow@@dashboardTransferArrow"> → </span>
                  <span>{{ t.toDisplayName }}</span>
                  <span class="money"> NT&#36;{{ t.amount }}</span>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .transfer-list {
        display: grid;
        gap: var(--space-3);
        list-style: none;
        margin: var(--space-4) 0 0;
        padding: 0;
      }

      .transfer-list__item {
        align-items: center;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding-bottom: var(--space-3);
      }
    `,
  ],
})
export class DashboardPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly expenseApi = inject(ExpenseApiService);
  private readonly settlementApi = inject(SettlementApiService);

  private readonly summary = signal<SettlementSummary | null>(null);
  private readonly expenses = signal<readonly ExpenseListItem[]>([]);
  protected readonly statusMessage = signal('');

  readonly suggestedTransfers = computed<readonly SuggestedTransfer[]>(
    () => this.summary()?.suggestedTransfers ?? [],
  );

  readonly thisMonthTotal = computed<number>(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.expenses()
      .filter((e) => e.expenseDate.startsWith(ym))
      .reduce((sum, e) => sum + e.amount, 0);
  });

  readonly myBalance = computed<number>(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return 0;
    return this.summary()?.balances.find((b) => b.userId === userId)?.net ?? 0;
  });

  readonly actionRequiredAmount = computed<number>(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return 0;
    return (
      this.summary()
        ?.suggestedTransfers.filter((transfer) => transfer.fromUserId === userId)
        .reduce((sum, transfer) => sum + transfer.amount, 0) ?? 0
    );
  });

  readonly recentActivityCount = computed<number>(() => this.expenses().length);

  ngOnInit(): void {
    this.settlementApi.getSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => {
        this.summary.set(null);
        this.statusMessage.set(
          $localize`:Dashboard settlement load error@@dashboardSettlementLoadError:無法載入結算資料，請稍後再試。`,
        );
      },
    });
    this.expenseApi.listExpenses().subscribe({
      next: (r) => this.expenses.set(r.expenses),
      error: () => {
        this.expenses.set([]);
        this.statusMessage.set(
          $localize`:Dashboard expenses load error@@dashboardExpensesLoadError:無法載入支出資料，請稍後再試。`,
        );
      },
    });
  }
}
