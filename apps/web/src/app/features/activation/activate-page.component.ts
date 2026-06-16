import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService, BROWSER_WINDOW } from '../../core/auth/auth.service';

export const ACTIVATION_INVITE_STORAGE_KEY = 'labSplit.activationInviteCode';

type ActivateForm = {
  readonly inviteCode: FormControl<string>;
};

@Component({
  selector: 'app-activate-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="activate-title">
      <div class="page-section__inner">
        <article class="panel activation-panel">
          <p class="eyebrow" i18n="Activation eyebrow@@activateEyebrow">LabSplit Invite</p>
          <h1 id="activate-title" class="heading-section" i18n="Activation title@@activateTitle">
            啟用邀請
          </h1>
          <p class="muted" i18n="Activation intro@@activateIntro">
            請登入後輸入邀請碼，手動啟用你的 LabSplit 帳號。
          </p>

          <form class="activation-form" [formGroup]="form" (ngSubmit)="submit()">
            <label class="field field--wide">
              <span i18n="Activation invite code label@@activateInviteCodeLabel">邀請碼</span>
              <input
                type="password"
                autocomplete="one-time-code"
                spellcheck="false"
                aria-describedby="activate-invite-hint"
                formControlName="inviteCode"
              />
              <span
                id="activate-invite-hint"
                class="activation-panel__hint"
                i18n="Activation invite hint@@activateInviteHint"
              >
                我們會在讀取連結後清除網址中的邀請碼。
              </span>
              @if (form.controls.inviteCode.invalid && form.controls.inviteCode.touched) {
                <span
                  class="field__error"
                  i18n="Activation invite required field@@activateInviteRequiredField"
                >
                  請先輸入邀請碼。
                </span>
              }
            </label>

            <button
              class="button button--primary"
              type="submit"
              [disabled]="isSubmitting() || retryAfterSeconds() > 0"
            >
              @if (retryAfterSeconds() > 0) {
                <span i18n="Activation submit countdown@@activateSubmitCountdown">
                  請等待 {{ retryAfterSeconds() }} 秒
                </span>
              } @else if (isSubmitting()) {
                <span i18n="Activation submitting@@activateSubmitting">啟用中…</span>
              } @else {
                <span i18n="Activation submit@@activateSubmit">啟用邀請</span>
              }
            </button>
          </form>

          @if (errorMessage()) {
            <p class="hero-band__login-error activation-panel__message" role="alert">
              {{ errorMessage() }}
            </p>
          }

          @if (showLoginActions()) {
            <div class="activation-panel__login">
              <p class="muted" i18n="Activation login prompt@@activateLoginPrompt">
                登入後會回到這個頁面，邀請碼只暫存在本次瀏覽工作階段。
              </p>
              <div
                class="hero-band__login-actions"
                role="group"
                aria-label="登入提供者"
                i18n-aria-label="Activation OAuth provider group@@activateOAuthProviders"
              >
                <button
                  class="oauth-button oauth-button--google"
                  type="button"
                  (click)="startGoogleSignIn()"
                  aria-label="Google"
                  i18n-aria-label="Activation Google login@@activateGoogleLogin"
                >
                  <span class="oauth-button__icon" aria-hidden="true">
                    <svg focusable="false" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  class="oauth-button oauth-button--apple"
                  type="button"
                  (click)="startAppleSignIn()"
                  aria-label="Apple"
                  i18n-aria-label="Activation Apple login@@activateAppleLogin"
                >
                  <span class="oauth-button__icon oauth-button__icon--apple" aria-hidden="true">
                    <svg focusable="false" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M17.05 12.35c-.03-2.42 1.98-3.58 2.07-3.64-1.13-1.65-2.88-1.88-3.49-1.9-1.49-.15-2.9.87-3.66.87-.77 0-1.95-.85-3.2-.82-1.65.02-3.17.96-4.02 2.44-1.72 2.98-.44 7.39 1.23 9.81.82 1.18 1.8 2.51 3.08 2.46 1.23-.05 1.7-.8 3.19-.8 1.49 0 1.91.8 3.2.78 1.32-.02 2.16-1.21 2.97-2.4.94-1.37 1.33-2.7 1.35-2.77-.03-.01-2.59-.99-2.62-4.03ZM14.66 5.25c.68-.83 1.14-1.97 1.02-3.12-.98.04-2.17.65-2.88 1.48-.63.73-1.18 1.9-1.03 3.02 1.09.08 2.2-.55 2.89-1.38Z"
                      />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          }
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      .activation-panel {
        display: grid;
        gap: var(--space-4);
        max-width: 38rem;
      }

      .activation-form,
      .activation-panel__login {
        display: grid;
        gap: var(--space-4);
      }

      .activation-panel__hint {
        color: var(--color-text-muted);
        font-size: 0.9rem;
      }

      .activation-panel__message {
        margin: 0;
      }

      @media (max-width: 720px) {
        .activation-panel .hero-band__login-actions {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ActivatePageComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browserWindow = inject(BROWSER_WINDOW);
  private retryAfterTimerId: ReturnType<typeof setInterval> | null = null;

  protected readonly form = new FormGroup<ActivateForm>({
    inviteCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly isSubmitting = signal(false);
  protected readonly retryAfterSeconds = signal(0);
  protected readonly showLoginActions = signal(false);
  private readonly staticErrorMessage = signal('');
  protected readonly errorMessage = computed(() => {
    const seconds = this.retryAfterSeconds();
    if (seconds > 0) {
      return $localize`:Activation rate limit with seconds@@activateRateLimitWithSeconds:嘗試次數太多，請等待 ${seconds}:seconds: 秒後再試。`;
    }
    return this.staticErrorMessage();
  });

  ngOnInit(): void {
    const queryParamMap = this.route.snapshot.queryParamMap;
    const hasInviteQuery = queryParamMap.has('invite') || queryParamMap.has('code');
    const queryInviteCode = normalizeInviteCode(
      queryParamMap.get('invite') ?? queryParamMap.get('code'),
    );

    if (hasInviteQuery) {
      if (queryInviteCode !== null) {
        this.form.controls.inviteCode.setValue(queryInviteCode);
      }
      this.clearStoredInviteCode();
      this.clearInviteQueryString();
      return;
    }

    const storedInviteCode = this.readStoredInviteCode();
    if (storedInviteCode !== null) {
      this.form.controls.inviteCode.setValue(storedInviteCode);
    }
  }

  ngOnDestroy(): void {
    this.clearRetryAfterCountdown();
  }

  protected submit(): void {
    this.resetRetryAfterCountdown();
    const inviteCode = this.normalizedFormInviteCode();
    this.form.controls.inviteCode.setValue(inviteCode ?? '');

    if (inviteCode === null || this.form.invalid) {
      this.form.markAllAsTouched();
      this.showLoginActions.set(false);
      this.staticErrorMessage.set(
        $localize`:Activation empty invite error@@activateEmptyInviteError:請先輸入邀請碼。`,
      );
      return;
    }

    this.isSubmitting.set(true);
    this.showLoginActions.set(false);
    this.staticErrorMessage.set('');

    this.authService.activate(inviteCode).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.clearStoredInviteCode();
        this.router.navigateByUrl('/dashboard').catch(() => undefined);
      },
      error: (error: HttpErrorResponse) => {
        this.handleActivateError(error);
      },
    });
  }

  protected startGoogleSignIn(): void {
    this.persistInviteCodeForSignIn();
    this.authService.startGoogleSignIn();
  }

  protected startAppleSignIn(): void {
    this.persistInviteCodeForSignIn();
    this.authService.startAppleSignIn();
  }

  private handleActivateError(error: HttpErrorResponse): void {
    this.isSubmitting.set(false);
    const code = readApiErrorCode(error);

    if (error.status === 401 || code === 'UNAUTHORIZED') {
      this.showLoginActions.set(true);
      this.staticErrorMessage.set(
        $localize`:Activation auth required@@activateAuthRequired:請先登入後再啟用邀請。`,
      );
      return;
    }

    this.showLoginActions.set(false);

    if (error.status === 429 || code === 'RATE_LIMITED') {
      const retryAfterSeconds = readRetryAfterSeconds(error);
      if (retryAfterSeconds !== null) {
        this.staticErrorMessage.set('');
        this.startRetryAfterCountdown(retryAfterSeconds);
        return;
      }
      this.staticErrorMessage.set(
        $localize`:Activation rate limit generic@@activateRateLimitGeneric:嘗試次數太多，請稍後再試。`,
      );
      return;
    }

    if (code === 'INVITE_CODE_INVALID') {
      this.staticErrorMessage.set(
        $localize`:Activation invalid invite@@activateInvalidInvite:邀請碼不正確或已失效。`,
      );
      return;
    }

    this.staticErrorMessage.set(
      $localize`:Activation generic error@@activateGenericError:無法啟用邀請，請稍後再試。`,
    );
  }

  private clearInviteQueryString(): void {
    this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      })
      .catch(() => undefined);
  }

  private normalizedFormInviteCode(): string | null {
    return normalizeInviteCode(this.form.controls.inviteCode.value);
  }

  private readStoredInviteCode(): string | null {
    try {
      const storage = this.browserWindow.sessionStorage;
      const inviteCode = normalizeInviteCode(storage.getItem(ACTIVATION_INVITE_STORAGE_KEY));
      storage.removeItem(ACTIVATION_INVITE_STORAGE_KEY);
      return inviteCode;
    } catch {
      return null;
    }
  }

  private persistInviteCodeForSignIn(): void {
    try {
      const storage = this.browserWindow.sessionStorage;
      const inviteCode = this.normalizedFormInviteCode();
      if (inviteCode === null) {
        storage.removeItem(ACTIVATION_INVITE_STORAGE_KEY);
        return;
      }
      storage.setItem(ACTIVATION_INVITE_STORAGE_KEY, inviteCode);
    } catch {
      return;
    }
  }

  private clearStoredInviteCode(): void {
    try {
      this.browserWindow.sessionStorage.removeItem(ACTIVATION_INVITE_STORAGE_KEY);
    } catch {
      return;
    }
  }

  private startRetryAfterCountdown(seconds: number): void {
    const normalizedSeconds = Math.max(1, Math.ceil(seconds));
    this.clearRetryAfterCountdown();
    this.retryAfterSeconds.set(normalizedSeconds);

    this.retryAfterTimerId = setInterval(() => {
      this.retryAfterSeconds.update((currentSeconds) => {
        const nextSeconds = Math.max(0, currentSeconds - 1);
        if (nextSeconds === 0) {
          this.clearRetryAfterCountdown();
        }
        return nextSeconds;
      });
    }, 1000);
  }

  private resetRetryAfterCountdown(): void {
    this.clearRetryAfterCountdown();
    this.retryAfterSeconds.set(0);
  }

  private clearRetryAfterCountdown(): void {
    if (this.retryAfterTimerId === null) return;
    clearInterval(this.retryAfterTimerId);
    this.retryAfterTimerId = null;
  }
}

function normalizeInviteCode(value: string | null): string | null {
  const trimmedValue = value?.trim() ?? '';
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readApiErrorCode(error: HttpErrorResponse): string | undefined {
  const code = readApiErrorEnvelope(error)?.['code'];
  return typeof code === 'string' ? code : undefined;
}

function readRetryAfterSeconds(error: HttpErrorResponse): number | null {
  const details = readApiErrorEnvelope(error)?.['details'];
  const retryAfterSeconds = isRecord(details) ? details['retryAfterSeconds'] : undefined;
  const retryAfterHeader = error.headers.get('Retry-After');
  const seconds = parsePositiveSeconds(retryAfterSeconds) ?? parsePositiveSeconds(retryAfterHeader);
  return seconds === null ? null : Math.ceil(seconds);
}

function readApiErrorEnvelope(
  error: HttpErrorResponse,
): Readonly<Record<string, unknown>> | undefined {
  const payload: unknown = error.error;
  if (!isRecord(payload)) return undefined;
  const apiError = payload['error'];
  return isRecord(apiError) ? apiError : undefined;
}

function parsePositiveSeconds(value: unknown): number | null {
  let seconds = Number.NaN;

  if (typeof value === 'number') {
    seconds = value;
  } else if (typeof value === 'string') {
    seconds = Number(value.trim());
  }

  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
