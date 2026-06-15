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
            class="button-row"
            aria-label="登入提供者"
            i18n-aria-label="OAuth provider group@@landingOAuthProviders"
          >
            <button
              class="oauth-button oauth-button--google"
              type="button"
              aria-label="使用 Google 繼續"
              i18n-aria-label="Google login@@landingGoogleLogin"
              (click)="startGoogleSignIn()"
            >
              <span class="oauth-button__icon" aria-hidden="true">
                <svg
                  class="oauth-button__logo oauth-button__logo--google"
                  viewBox="0 0 18 18"
                  focusable="false"
                >
                  <path
                    fill="#4285f4"
                    d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
                  />
                  <path
                    fill="#34a853"
                    d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
                  />
                  <path
                    fill="#fbbc05"
                    d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33z"
                  />
                  <path
                    fill="#ea4335"
                    d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58z"
                  />
                </svg>
              </span>
            </button>
            <button
              class="oauth-button oauth-button--apple"
              type="button"
              aria-label="使用 Apple 繼續"
              i18n-aria-label="Apple login@@landingAppleLogin"
              (click)="startAppleSignIn()"
            >
              <span class="oauth-button__icon" aria-hidden="true">
                <svg
                  class="oauth-button__logo oauth-button__logo--apple"
                  viewBox="0 0 24 24"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M16.37 1.51c0 1.12-.41 2.11-1.23 2.97-.98 1.01-2.05 1.59-3.21 1.5a4.36 4.36 0 0 1 1.27-3.14c.86-.94 2.19-1.64 3.17-1.33zM20.06 17.32c-.39.9-.58 1.3-1.08 2.09-.7 1.07-1.69 2.4-2.91 2.41-1.09.01-1.37-.7-2.84-.7-1.48 0-1.8.69-2.89.71-1.22.02-2.15-1.22-2.86-2.29-1.95-2.98-2.16-6.48-.95-8.34.86-1.33 2.22-2.11 3.5-2.11 1.3 0 2.12.71 3.2.71 1.04 0 1.68-.72 3.19-.72 1.14 0 2.35.62 3.2 1.69-2.81 1.54-2.35 5.55.44 6.55z"
                  />
                </svg>
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
