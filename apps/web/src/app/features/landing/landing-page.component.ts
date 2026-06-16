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
              <span
                id="landing-google-login-label"
                class="oauth-button__text"
                i18n="Google login@@landingGoogleLogin"
              >
                使用 Google 繼續
              </span>
            </button>
            <button
              class="oauth-button oauth-button--apple"
              type="button"
              aria-labelledby="landing-apple-login-label"
              (click)="startAppleSignIn()"
            >
              <span
                id="landing-apple-login-label"
                class="oauth-button__text"
                i18n="Apple login@@landingAppleLogin"
              >
                使用 Apple 繼續
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
