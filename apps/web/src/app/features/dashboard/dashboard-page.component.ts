import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="dashboard-title">
      <div class="page-section__inner">
        <h1 id="dashboard-title" class="heading-section" i18n="Dashboard title@@dashboardTitle">
          儀表板
        </h1>

        <div
          class="metric-grid"
          aria-label="儀表板指標"
          i18n-aria-label="Dashboard metrics group@@dashboardMetrics"
        >
          <article class="metric-card">
            <p class="metric-card__label" i18n="This month card@@dashboardThisMonth">本月支出</p>
            <p class="metric-card__value money">NT$0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Balance card@@dashboardYourBalance">你的餘額</p>
            <p class="metric-card__value money">NT$0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Action card@@dashboardActionRequired">待處理</p>
            <p class="metric-card__value money">NT$0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Activity card@@dashboardRecentActivity">最近活動</p>
            <p class="metric-card__value">0</p>
          </article>
        </div>

        <section class="panel" aria-labelledby="dashboard-settlement-title">
          <h2
            id="dashboard-settlement-title"
            i18n="Dashboard settlement suggestions@@dashboardSettlementSuggestions"
          >
            結算建議
          </h2>
          <p class="muted" i18n="Dashboard empty state@@dashboardNoRecentActivity">
            目前沒有需要結算的支出。
          </p>
        </section>
      </div>
    </section>
  `,
})
export class DashboardPageComponent {}
