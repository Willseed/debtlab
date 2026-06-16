import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section hero-band" aria-labelledby="landing-title">
      <div class="page-section__inner hero-band__inner">
        <p class="eyebrow">LabSplit Black Gold</p>
        <h1 id="landing-title" class="heading-hero" i18n="Landing hero title@@landingHeroTitle">
          實驗室花費，精準拆帳
        </h1>
        <p class="hero-band__subtitle" i18n="Landing hero subtitle@@landingHeroSubtitle">
          給任何人使用的共同支出拆帳儀表板。
        </p>
        @if (!isAuthenticated()) {
          <div
            class="hero-band__login-actions"
            role="group"
            aria-label="登入提供者"
            i18n-aria-label="OAuth provider group@@landingOAuthProviders"
          >
            <button
              class="oauth-button oauth-button--google"
              type="button"
              aria-labelledby="landing-google-login-label"
              (click)="startGoogleSignIn()"
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
              <span
                id="landing-google-login-label"
                class="oauth-button__text"
                i18n="Google login@@landingGoogleLogin"
              >
                Google
              </span>
            </button>
            <button
              class="oauth-button oauth-button--apple"
              type="button"
              aria-labelledby="landing-apple-login-label"
              (click)="startAppleSignIn()"
            >
              <span class="oauth-button__icon oauth-button__icon--apple" aria-hidden="true">
                <svg focusable="false" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M17.05 12.35c-.03-2.42 1.98-3.58 2.07-3.64-1.13-1.65-2.88-1.88-3.49-1.9-1.49-.15-2.9.87-3.66.87-.77 0-1.95-.85-3.2-.82-1.65.02-3.17.96-4.02 2.44-1.72 2.98-.44 7.39 1.23 9.81.82 1.18 1.8 2.51 3.08 2.46 1.23-.05 1.7-.8 3.19-.8 1.49 0 1.91.8 3.2.78 1.32-.02 2.16-1.21 2.97-2.4.94-1.37 1.33-2.7 1.35-2.77-.03-.01-2.59-.99-2.62-4.03ZM14.66 5.25c.68-.83 1.14-1.97 1.02-3.12-.98.04-2.17.65-2.88 1.48-.63.73-1.18 1.9-1.03 3.02 1.09.08 2.2-.55 2.89-1.38Z"
                  />
                </svg>
              </span>
              <span
                id="landing-apple-login-label"
                class="oauth-button__text"
                i18n="Apple login@@landingAppleLogin"
              >
                Apple
              </span>
            </button>
          </div>
          @if (authErrorCode === 'user_not_active') {
            <p
              class="hero-band__login-error"
              role="alert"
              i18n="OAuth login inactive user error@@landingLoginInactiveError"
            >
              登入未完成：你的帳號已停用，請聯絡管理員。
            </p>
          } @else if (authErrorCode) {
            <p
              class="hero-band__login-error"
              role="alert"
              i18n="OAuth login generic error@@landingLoginGenericError"
            >
              登入未完成，請稍後再試或聯絡管理員。
            </p>
          }
        } @else {
          <a
            class="button button--primary"
            routerLink="/dashboard"
            i18n="Dashboard CTA@@landingDashboardCta"
          >
            前往儀表板
          </a>
        }
      </div>
    </section>
  `,
})
export class LandingPageComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly authErrorCode = this.route.snapshot.queryParamMap.get('auth_error');

  startGoogleSignIn(): void {
    this.authService.startGoogleSignIn();
  }

  startAppleSignIn(): void {
    this.authService.startAppleSignIn();
  }
}
