import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-settlements-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="settlements-title">
      <div class="page-section__inner">
        <h1
          id="settlements-title"
          class="heading-section"
          i18n="Settlements title@@settlementsTitle"
        >
          結算
        </h1>

        <div class="metric-grid">
          <article class="metric-card">
            <p class="metric-card__label" i18n="Balance summary@@settlementBalanceSummary">
              餘額總覽
            </p>
            <p class="metric-card__value money">NT$0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Suggested transfers@@settlementSuggestedTransfers">
              建議轉帳
            </p>
            <p class="metric-card__value">0</p>
          </article>
        </div>

        <div class="button-row">
          <button
            class="button button--primary"
            type="button"
            i18n="Record payment@@settlementRecordPayment"
          >
            記錄付款
          </button>
          <button
            class="button button--secondary"
            type="button"
            i18n="Confirm payment@@settlementConfirmPayment"
          >
            確認付款
          </button>
        </div>

        <p class="muted" i18n="Settlement empty state@@settlementEmpty">目前沒有待確認付款。</p>
      </div>
    </section>
  `,
})
export class SettlementsPageComponent {}
