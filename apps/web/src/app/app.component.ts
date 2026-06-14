import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main" i18n="Skip link@@appSkipLink">跳到主要內容</a>

    <header class="app-shell__header">
      <div class="app-shell__bar">
        <a class="app-shell__brand" routerLink="/" i18n="App brand@@appBrand">
          LabSplit Black Gold
        </a>

        <nav class="app-shell__nav" aria-label="主要導覽" i18n-aria-label="Nav label@@appNavLabel">
          @if (!isAuthenticated()) {
            <a
              routerLink="/"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: true }"
              i18n="Home nav@@appNavHome"
            >
              首頁
            </a>
          } @else {
            <a
              routerLink="/dashboard"
              routerLinkActive="is-active"
              i18n="Dashboard nav@@appNavDashboard"
            >
              儀表板
            </a>
            <a
              routerLink="/expenses"
              routerLinkActive="is-active"
              i18n="Expenses nav@@appNavExpenses"
            >
              支出
            </a>
            <a
              routerLink="/settlements"
              routerLinkActive="is-active"
              i18n="Settlements nav@@appNavSettlements"
            >
              結算
            </a>
            @if (isAdmin()) {
              <a routerLink="/admin" routerLinkActive="is-active" i18n="Admin nav@@appNavAdmin">
                管理
              </a>
            }
            <a routerLink="/garage" routerLinkActive="is-active" i18n="Garage nav@@appNavGarage">
              車庫
            </a>
            <button
              type="button"
              class="app-shell__signout"
              (click)="signOut()"
              i18n="Sign out nav@@appNavSignOut"
            >
              登出
            </button>
          }
        </nav>
      </div>
    </header>

    <main id="main" class="app-shell__main" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAdmin = this.authService.isAdmin;

  protected signOut(): void {
    this.authService.signOut().subscribe((isSignedOut) => {
      if (isSignedOut) {
        this.router.navigateByUrl('/').catch(() => undefined);
      }
    });
  }
}
