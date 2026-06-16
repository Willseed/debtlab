import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import {
  PendingPayment,
  SettlementApiService,
  SettlementSummary,
  SuggestedTransfer,
} from './settlement-api.service';

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
            <p class="metric-card__value money">NT&#36;{{ myBalance() }}</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Suggested transfers@@settlementSuggestedTransfers">
              建議轉帳
            </p>
            <p class="metric-card__value">{{ suggestedTransfers().length }}</p>
          </article>
        </div>

        @if (suggestedTransfers().length > 0) {
          <section class="panel" aria-labelledby="transfers-title">
            <h2
              id="transfers-title"
              i18n="Suggested transfers section@@settlementSuggestedTransfersSection"
            >
              建議轉帳
            </h2>
            <ul class="transfer-list">
              @for (t of suggestedTransfers(); track t.fromUserId + t.toUserId) {
                <li class="transfer-list__item">
                  <span>{{ t.fromDisplayName }}</span>
                  <span i18n="Transfer arrow@@settlementTransferArrow"> → </span>
                  <span>{{ t.toDisplayName }}</span>
                  <span class="money"> NT&#36;{{ t.amount }}</span>
                  @if (canRecordTransfer(t)) {
                    <button
                      class="button button--primary"
                      type="button"
                      (click)="recordTransfer(t)"
                      [disabled]="isRecordingTransfer(t)"
                      i18n="Record payment@@settlementRecordPayment"
                    >
                      記錄付款
                    </button>
                  } @else if (hasPendingPaymentForTransfer(t)) {
                    <span
                      class="badge badge--pending"
                      i18n="Transfer pending badge@@settlementTransferPendingBadge"
                    >
                      等待確認
                    </span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <section class="panel" aria-labelledby="pending-title">
          <h2 id="pending-title" i18n="Pending payments@@settlementPendingPayments">待確認付款</h2>
          @if (pendingPayments().length === 0) {
            <p class="muted" i18n="Settlement empty state@@settlementEmpty">目前沒有待確認付款。</p>
          } @else {
            <ul class="transfer-list">
              @for (p of pendingPayments(); track p.id) {
                <li class="transfer-list__item">
                  <span>{{ p.fromDisplayName }}</span>
                  <span i18n="Transfer arrow@@settlementPendingArrow"> → </span>
                  <span>{{ p.toDisplayName }}</span>
                  <span class="money"> NT&#36;{{ p.amount }}</span>
                  <span
                    class="badge badge--pending"
                    i18n="Pending status badge@@settlementStatusPending"
                    >待確認</span
                  >
                  @if (canConfirm(p)) {
                    <button
                      class="button button--secondary"
                      type="button"
                      (click)="confirmPayment(p)"
                      [disabled]="isConfirmingPayment(p.id)"
                      i18n="Confirm payment@@settlementConfirmPayment"
                    >
                      確認付款
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </section>

        @if (statusMessage()) {
          <p class="field__error" role="status">{{ statusMessage() }}</p>
        }
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
        gap: var(--space-3);
        padding-bottom: var(--space-3);
      }

      .badge {
        border: 1px solid var(--color-border);
        border-radius: 999px;
        color: var(--color-text-muted);
        font-size: 0.9rem;
        padding: var(--space-1) var(--space-3);
      }

      .badge--pending {
        border-color: var(--color-warning);
        color: var(--color-warning);
      }
    `,
  ],
})
export class SettlementsPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly settlementApi = inject(SettlementApiService);

  private readonly summary = signal<SettlementSummary | null>(null);
  protected readonly statusMessage = signal('');
  protected readonly recordingTransferKey = signal<string | null>(null);
  protected readonly confirmingPaymentIds = signal<ReadonlySet<string>>(new Set());

  readonly myBalance = computed<number>(() => {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return 0;
    return this.summary()?.balances.find((b) => b.userId === userId)?.net ?? 0;
  });

  readonly suggestedTransfers = computed<readonly SuggestedTransfer[]>(
    () => this.summary()?.suggestedTransfers ?? [],
  );

  readonly pendingPayments = computed<readonly PendingPayment[]>(
    () => this.summary()?.pendingPayments ?? [],
  );

  ngOnInit(): void {
    this.loadSummary();
  }

  canRecordTransfer(t: SuggestedTransfer): boolean {
    const userId = this.authService.currentUser()?.id;
    const isAdmin = this.authService.isAdmin();
    const isJoinedMember = this.summary()?.balances.some((balance) => balance.userId === userId);
    return !!userId && (isJoinedMember || isAdmin) && !this.hasPendingPaymentForTransfer(t);
  }

  canConfirm(p: PendingPayment): boolean {
    const userId = this.authService.currentUser()?.id;
    const isAdmin = this.authService.isAdmin();
    return userId === p.toUserId || isAdmin;
  }

  hasPendingPaymentForTransfer(t: SuggestedTransfer): boolean {
    return this.pendingPayments().some(
      (payment) => payment.fromUserId === t.fromUserId && payment.toUserId === t.toUserId,
    );
  }

  isRecordingTransfer(t: SuggestedTransfer): boolean {
    return this.recordingTransferKey() === this.transferKey(t);
  }

  isConfirmingPayment(paymentId: string): boolean {
    return this.confirmingPaymentIds().has(paymentId);
  }

  recordTransfer(t: SuggestedTransfer): void {
    if (!this.canRecordTransfer(t) || this.isRecordingTransfer(t)) {
      return;
    }

    this.recordingTransferKey.set(this.transferKey(t));
    this.statusMessage.set('');
    this.settlementApi
      .recordPayment({
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: t.amount,
      })
      .subscribe({
        next: (response) => {
          this.recordingTransferKey.set(null);
          this.statusMessage.set(
            response.payment.status === 'confirmed'
              ? $localize`:Settlement payment recorded and confirmed@@settlementPaymentRecordedConfirmed:已記錄並確認付款。`
              : $localize`:Settlement payment recorded@@settlementPaymentRecorded:已記錄付款，等待收款方確認。`,
          );
          this.loadSummary();
        },
        error: () => {
          this.recordingTransferKey.set(null);
          this.statusMessage.set(
            $localize`:Settlement payment record error@@settlementPaymentRecordError:無法記錄付款，請稍後再試。`,
          );
        },
      });
  }

  confirmPayment(p: PendingPayment): void {
    if (!this.canConfirm(p) || this.isConfirmingPayment(p.id)) {
      return;
    }

    this.confirmingPaymentIds.update((ids) => new Set(ids).add(p.id));
    this.statusMessage.set('');
    this.settlementApi.confirmPayment(p.id).subscribe({
      next: () => {
        this.confirmingPaymentIds.update((ids) => {
          const nextIds = new Set(ids);
          nextIds.delete(p.id);
          return nextIds;
        });
        this.statusMessage.set(
          $localize`:Settlement payment confirmed@@settlementPaymentConfirmed:已確認付款。`,
        );
        this.loadSummary();
      },
      error: () => {
        this.confirmingPaymentIds.update((ids) => {
          const nextIds = new Set(ids);
          nextIds.delete(p.id);
          return nextIds;
        });
        this.statusMessage.set(
          $localize`:Settlement payment confirm error@@settlementPaymentConfirmError:無法確認付款，請稍後再試。`,
        );
      },
    });
  }

  private loadSummary(): void {
    this.settlementApi.getSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => {
        this.summary.set(null);
        this.statusMessage.set(
          $localize`:Settlement summary load error@@settlementSummaryLoadError:無法載入結算資料，請稍後再試。`,
        );
      },
    });
  }

  private transferKey(t: SuggestedTransfer): string {
    return `${t.fromUserId}:${t.toUserId}:${t.amount}`;
  }
}
