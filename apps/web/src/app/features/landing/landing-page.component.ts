import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section hero-band" aria-labelledby="landing-title">
      <div class="page-section__inner hero-band__inner">
        <p class="eyebrow">LabSplit Black Gold</p>
        <h1 id="landing-title" class="heading-hero" i18n="Landing hero title@@landingHeroTitle">
          實驗室花費，精準拆帳
        </h1>
        <p class="hero-band__subtitle" i18n="Landing hero subtitle@@landingHeroSubtitle">
          給實驗室共同支出使用的私有拆帳儀表板。
        </p>
        <div
          class="button-row"
          aria-label="登入提供者"
          i18n-aria-label="OAuth provider group@@landingOAuthProviders"
        >
          <button
            class="button button--primary"
            type="button"
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
      </div>
    </section>
  `,
})
export class LandingPageComponent {}
