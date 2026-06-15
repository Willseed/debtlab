import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  MysteryChallengeApiService,
  MysteryChallengeLeaderboardEntry,
  MysteryChallengeState,
} from './mystery-challenge-api.service';

@Component({
  selector: 'app-mystery-challenge-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="mystery-title">
      <div class="page-section__inner">
        <header class="mystery-hero">
          <p class="eyebrow" i18n="Mystery challenge eyebrow@@mysteryChallengeEyebrow">
            神秘密碼挑戰
          </p>
          <h1
            id="mystery-title"
            class="heading-section"
            i18n="Mystery challenge title@@mysteryChallengeTitle"
          >
            神秘挑戰
          </h1>
          <p class="mystery-hero__intro" i18n="Mystery challenge intro@@mysteryChallengeIntro">
            提交有效的原始密碼。每位成員只能完成一次，每組密碼也只接受第一位提交者。
          </p>
        </header>

        <section class="panel mystery-panel" aria-labelledby="mystery-status-title">
          <h2 id="mystery-status-title" i18n="Mystery status title@@mysteryStatusTitle">
            挑戰狀態
          </h2>
          @if (stateLoadError()) {
            <p class="field__error" role="alert">{{ stateLoadError() }}</p>
          } @else if (stateLoading()) {
            <p
              class="muted"
              role="status"
              aria-live="polite"
              i18n="Mystery status loading@@mysteryStatusLoading"
            >
              正在載入挑戰狀態…
            </p>
          } @else {
            <dl
              class="mystery-status-list"
              aria-label="挑戰狀態"
              i18n-aria-label="Mystery status list label@@mysteryStatusListLabel"
            >
              <div>
                <dt i18n="Mystery availability label@@mysteryAvailabilityLabel">開放狀態</dt>
                <dd>{{ availabilityStatus() }}</dd>
              </div>
              <div>
                <dt i18n="Mystery progress label@@mysteryProgressLabel">進度</dt>
                <dd>{{ progressStatus() }}</dd>
              </div>
              <div>
                <dt i18n="Mystery claimed label@@mysteryClaimedLabel">已領取</dt>
                <dd>
                  {{ challenge()?.claimedCount ?? 0 }}/{{
                    challenge()?.encodedPasswords?.length ?? 0
                  }}
                </dd>
              </div>
            </dl>
          }
        </section>

        <section class="panel mystery-panel" aria-labelledby="mystery-submit-title">
          <h2 id="mystery-submit-title" i18n="Mystery submission title@@mysterySubmissionTitle">
            提交答案
          </h2>
          @if (errorMessage()) {
            <p id="mystery-submit-error" class="field__error" role="alert" aria-live="assertive">
              {{ errorMessage() }}
            </p>
          }
          @if (submissionClosedReason()) {
            <p class="muted" role="status" aria-live="polite">{{ submissionClosedReason() }}</p>
          } @else if (stateLoadError()) {
            <p
              class="field__error"
              role="alert"
              i18n="Mystery submission paused state error@@mysterySubmissionPausedStateError"
            >
              挑戰狀態無法讀取，提交已暫停。
            </p>
          } @else if (stateLoading()) {
            <p
              class="muted"
              role="status"
              aria-live="polite"
              i18n="Mystery submission waiting status@@mysterySubmissionWaitingStatus"
            >
              正在載入挑戰狀態…
            </p>
          } @else {
            <form
              class="mystery-form"
              (submit)="submitPassword(); $event.preventDefault()"
              novalidate
            >
              <label class="field field--wide">
                <span i18n="Mystery password label@@mysteryPasswordLabel">原始密碼</span>
                <input
                  id="mystery-password"
                  type="password"
                  [formControl]="passwordControl"
                  autocomplete="off"
                  aria-required="true"
                  [attr.aria-describedby]="errorMessage() ? 'mystery-submit-error' : null"
                  i18n-placeholder="Mystery password placeholder@@mysteryPasswordPlaceholder"
                  placeholder="輸入原始密碼"
                />
              </label>
              <button
                type="submit"
                class="button button--primary mystery-form__submit"
                [disabled]="!canSubmit() || passwordControl.invalid"
              >
                @if (submitting()) {
                  <span i18n="Mystery submitting button@@mysterySubmittingButton">提交中…</span>
                } @else {
                  <span i18n="Mystery submit button@@mysterySubmitButton">提交密碼</span>
                }
              </button>
            </form>
          }
        </section>

        <section class="panel mystery-panel" aria-labelledby="mystery-leaderboard-title">
          <h2
            id="mystery-leaderboard-title"
            i18n="Mystery leaderboard title@@mysteryLeaderboardTitle"
          >
            排行榜
          </h2>
          @if (leaderboardLoadError()) {
            <p class="field__error" role="alert">{{ leaderboardLoadError() }}</p>
          } @else if (leaderboardLoading()) {
            <p
              class="muted"
              role="status"
              aria-live="polite"
              i18n="Mystery leaderboard loading@@mysteryLeaderboardLoading"
            >
              正在載入排行榜…
            </p>
          } @else if (leaderboardEntries().length === 0) {
            <p class="muted" i18n="Mystery leaderboard empty@@mysteryLeaderboardEmpty">
              目前還沒有人完成挑戰。
            </p>
          } @else {
            <div class="table-wrap">
              <table>
                <caption i18n="Mystery leaderboard caption@@mysteryLeaderboardCaption">
                  依完成名次排序的神秘挑戰排行榜
                </caption>
                <thead>
                  <tr>
                    <th scope="col" i18n="Mystery leaderboard rank@@mysteryLeaderboardRank">
                      名次
                    </th>
                    <th scope="col" i18n="Mystery leaderboard member@@mysteryLeaderboardMember">
                      成員
                    </th>
                    <th
                      scope="col"
                      i18n="Mystery leaderboard completed at@@mysteryLeaderboardCompletedAt"
                    >
                      完成時間
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (
                    entry of leaderboardEntries();
                    track entry.rank + entry.displayName + entry.completedAt
                  ) {
                    <tr>
                      <td class="money">{{ entry.rank }}</td>
                      <td>{{ entry.displayName }}</td>
                      <td>
                        @if (completedAtDate(entry.completedAt); as completedAt) {
                          <time [attr.datetime]="entry.completedAt">
                            {{ completedAt | date: 'yyyy/MM/dd HH:mm' : '+0800' }}
                          </time>
                        } @else {
                          <span>{{ entry.completedAt }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .mystery-hero,
      .mystery-panel {
        display: grid;
        gap: var(--space-4);
      }

      .mystery-hero {
        max-width: 48rem;
      }

      .mystery-hero__intro,
      .mystery-panel p {
        color: var(--color-text-muted);
        line-height: 1.7;
        margin: 0;
      }

      .mystery-panel h2 {
        color: var(--color-gold-soft);
        margin: 0;
      }

      .mystery-status-list {
        display: grid;
        gap: var(--space-4);
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
        margin: 0;
      }

      .mystery-status-list div {
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-3);
      }

      .mystery-status-list dt {
        color: var(--color-text-muted);
        font-size: 0.92rem;
        margin-bottom: var(--space-2);
      }

      .mystery-status-list dd {
        color: var(--color-text);
        font-size: 1.35rem;
        font-weight: 800;
        margin: 0;
      }

      .mystery-form {
        display: grid;
        gap: var(--space-3);
        max-width: 32rem;
      }

      .mystery-form__submit {
        width: 100%;
      }

      .mystery-panel caption {
        color: var(--color-text-muted);
        margin-bottom: var(--space-3);
        text-align: left;
      }
    `,
  ],
})
export class MysteryChallengePageComponent implements OnInit {
  private readonly api = inject(MysteryChallengeApiService);

  protected readonly challenge = signal<MysteryChallengeState | null>(null);
  protected readonly leaderboard = signal<readonly MysteryChallengeLeaderboardEntry[]>([]);
  protected readonly stateLoading = signal(true);
  protected readonly leaderboardLoading = signal(true);
  protected readonly stateLoadError = signal('');
  protected readonly leaderboardLoadError = signal('');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly passwordControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  protected readonly leaderboardEntries = computed<readonly MysteryChallengeLeaderboardEntry[]>(
    () => [...this.leaderboard()].sort(compareLeaderboardEntries),
  );

  protected readonly availabilityStatus = computed(() => {
    const challenge = this.challenge();
    if (!challenge) return $localize`:Mystery status unavailable@@mysteryStatusUnavailable:不可用`;
    if (challenge.completed) {
      return $localize`:Mystery status completed@@mysteryStatusCompleted:已完成`;
    }
    if (challenge.status === 'active' && challenge.availableCount > 0) {
      return $localize`:Mystery status available@@mysteryStatusAvailable:可提交`;
    }
    if (challenge.status === 'closed') {
      return $localize`:Mystery status closed@@mysteryStatusClosed:已關閉`;
    }
    if (challenge.status === 'unavailable') {
      return $localize`:Mystery status unavailable@@mysteryStatusUnavailable:不可用`;
    }
    if (challenge.availableCount <= 0) {
      return $localize`:Mystery status all claimed@@mysteryStatusAllClaimed:全部已領取`;
    }
    return $localize`:Mystery status unavailable@@mysteryStatusUnavailable:不可用`;
  });

  protected readonly progressStatus = computed(() => {
    const challenge = this.challenge();
    if (!challenge)
      return $localize`:Mystery progress unavailable@@mysteryProgressUnavailable:不可用`;
    return challenge.completed
      ? $localize`:Mystery progress completed@@mysteryProgressCompleted:已完成`
      : $localize`:Mystery progress open@@mysteryProgressOpen:進行中`;
  });

  protected readonly submissionClosedReason = computed(() => {
    const challenge = this.challenge();
    if (!challenge) return '';
    if (this.successMessage()) return this.successMessage();
    if (challenge.completed) {
      return $localize`:Mystery already completed closed reason@@mysteryAlreadyCompletedClosedReason:你已完成挑戰，提交已關閉。`;
    }
    if (challenge.status !== 'unavailable' && challenge.availableCount <= 0) {
      return $localize`:Mystery all claimed closed reason@@mysteryAllClaimedClosedReason:三組密碼皆已被領取，提交已關閉。`;
    }
    if (challenge.status === 'closed') {
      return $localize`:Mystery closed reason@@mysteryClosedReason:挑戰已關閉，提交已暫停。`;
    }
    if (challenge.status !== 'active') {
      return $localize`:Mystery unavailable closed reason@@mysteryUnavailableClosedReason:挑戰目前不可用，提交已暫停。`;
    }
    return '';
  });

  protected readonly canSubmit = computed(
    () => this.challenge() !== null && this.submissionClosedReason() === '' && !this.submitting(),
  );

  ngOnInit(): void {
    this.loadState();
    this.loadLeaderboard();
  }

  protected submitPassword(): void {
    if (!this.canSubmit()) return;
    const password = this.passwordControl.value.trim();
    if (!password) {
      this.errorMessage.set(
        $localize`:Mystery empty password error@@mysteryEmptyPasswordError:請先輸入原始密碼。`,
      );
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.api.submitPassword(password).subscribe({
      next: (response) => {
        this.leaderboard.set(response.leaderboard);
        this.passwordControl.reset('');
        this.successMessage.set(
          $localize`:Mystery submit success@@mysterySubmitSuccess:已完成挑戰，提交已關閉。排行榜已更新。`,
        );
        this.submitting.set(false);
        this.loadState();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(formatSubmitError(error));
        if (isConflictError(error)) {
          this.loadState();
          this.loadLeaderboard();
        }
      },
    });
  }

  protected completedAtDate(value: string): Date | null {
    const timestamp = completedAtTimestamp(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }

  private loadState(): void {
    this.stateLoading.set(true);
    this.stateLoadError.set('');
    this.api.getChallengeState().subscribe({
      next: (state) => {
        this.challenge.set(state);
        this.stateLoading.set(false);
      },
      error: () => {
        this.challenge.set(null);
        this.stateLoadError.set(
          $localize`:Mystery state load error@@mysteryStateLoadError:挑戰狀態無法讀取，請稍後再試。`,
        );
        this.stateLoading.set(false);
      },
    });
  }

  private loadLeaderboard(): void {
    this.leaderboardLoading.set(true);
    this.leaderboardLoadError.set('');
    this.api.getLeaderboard().subscribe({
      next: (response) => {
        this.leaderboard.set(response.leaderboard);
        this.leaderboardLoading.set(false);
      },
      error: () => {
        this.leaderboard.set([]);
        this.leaderboardLoadError.set(
          $localize`:Mystery leaderboard load error@@mysteryLeaderboardLoadError:無法載入排行榜，請稍後再試。`,
        );
        this.leaderboardLoading.set(false);
      },
    });
  }
}

function formatSubmitError(error: HttpErrorResponse): string {
  const code = readApiErrorCode(error);
  if (isConflictError(error)) {
    return $localize`:Mystery conflict generic@@mysteryConflictGeneric:你已完成挑戰，或這組密碼已被領取；提交已關閉，請查看挑戰狀態。`;
  }
  if (code === 'VALIDATION_ERROR') {
    return $localize`:Mystery validation error@@mysteryValidationError:密碼錯誤或已被使用，請確認後再試。`;
  }
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
    return $localize`:Mystery unauthorized error@@mysteryUnauthorizedError:登入狀態已失效，請重新登入後再試。`;
  }
  return $localize`:Mystery wrong password error@@mysteryWrongPasswordError:無法提交密碼，請稍後再試。`;
}

function compareLeaderboardEntries(
  left: MysteryChallengeLeaderboardEntry,
  right: MysteryChallengeLeaderboardEntry,
): number {
  const rankOrder = left.rank - right.rank;
  if (rankOrder !== 0) return rankOrder;

  const leftTimestamp = completedAtTimestamp(left.completedAt);
  const rightTimestamp = completedAtTimestamp(right.completedAt);
  const leftHasTimestamp = Number.isFinite(leftTimestamp);
  const rightHasTimestamp = Number.isFinite(rightTimestamp);
  if (leftHasTimestamp && rightHasTimestamp) {
    const timeOrder = leftTimestamp - rightTimestamp;
    if (timeOrder !== 0) return timeOrder;
    return left.displayName.localeCompare(right.displayName);
  }
  if (leftHasTimestamp) return -1;
  if (rightHasTimestamp) return 1;
  const completedAtOrder = left.completedAt.localeCompare(right.completedAt);
  if (completedAtOrder === 0) {
    return left.displayName.localeCompare(right.displayName);
  }
  return completedAtOrder;
}

function completedAtTimestamp(value: string): number {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(value)
    ? `${value.replace(' ', 'T')}+08:00`
    : value;
  return Date.parse(normalized);
}

function readApiErrorCode(error: HttpErrorResponse): string | undefined {
  const payload = error.error as { readonly error?: { readonly code?: string } } | null;
  return payload?.error?.code;
}

function isConflictError(error: HttpErrorResponse): boolean {
  const code = readApiErrorCode(error);
  return (
    error.status === 409 ||
    code === 'CONFLICT' ||
    code === 'ALREADY_COMPLETED' ||
    code === 'PASSWORD_ALREADY_CLAIMED' ||
    code === 'MYSTERY_CHALLENGE_COMPLETED' ||
    code === 'MYSTERY_CHALLENGE_CLAIMED'
  );
}
