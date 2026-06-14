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
              class="button button--primary"
              type="button"
              (click)="startGoogleSignIn()"
              i18n="Google login@@landingGoogleLogin"
            >
              使用 Google 繼續
            </button>
            <button
              class="button button--secondary"
              type="button"
              disabled
              aria-describedby="apple-login-disabled-hint"
              i18n="Apple login@@landingAppleLogin"
            >
              使用 Apple 繼續
            </button>
          </div>
          <p
            id="apple-login-disabled-hint"
            class="hero-band__login-note"
            i18n="Apple login disabled note@@landingAppleLoginDisabledNote"
          >
            Apple 登入審核中，暫不開放。
          </p>
          @if (authErrorCode === 'user_not_active') {
            <p
              class="hero-band__login-error"
              role="alert"
              i18n="Google login inactive user error@@landingGoogleLoginInactiveError"
            >
              Google 登入未完成：你的帳號已停用，請聯絡管理員。
            </p>
          } @else if (authErrorCode) {
            <p
              class="hero-band__login-error"
              role="alert"
              i18n="Google login generic error@@landingGoogleLoginGenericError"
            >
              Google 登入未完成，請稍後再試或聯絡管理員。
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
}
