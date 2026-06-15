import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { environment } from '../../../environments/environment';

declare const $localize: (
  messageParts: TemplateStringsArray,
  ...expressions: readonly unknown[]
) => string;

type GarageCTFStatus = {
  readonly solved: boolean;
  readonly solvedAt: string | null;
  readonly firstSolverDisplayName: string | null;
};

@Component({
  selector: 'app-garage-page',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="garage-title">
      <div class="page-section__inner">
        <h1 id="garage-title" class="heading-section" i18n="Garage title@@garageTitle">隱藏車庫</h1>

        <p class="garage-intro" i18n="Garage intro@@garageIntro">
          你發現了隱藏車庫。這裡藏著一個謎題，找到密碼，成為第一位解鎖者。
        </p>

        @if (statusLoadError()) {
          <div class="panel garage-status-panel" role="alert">
            <p class="field__error">{{ statusLoadError() }}</p>
          </div>
        } @else if (status() === null) {
          <div class="panel garage-status-panel" role="status" aria-live="polite">
            <p class="muted" i18n="Garage loading status@@garageLoadingStatus">正在讀取車庫狀態…</p>
          </div>
        } @else if (status()?.solved) {
          <div class="panel garage-solved" role="status" aria-live="polite">
            <p class="garage-solved__label" i18n="Garage solved label@@garageSolvedLabel">
              此關卡已由以下成員率先完成：
            </p>
            <p class="garage-solved__name">{{ status()!.firstSolverDisplayName }}</p>
          </div>
        } @else {
          <form
            class="panel garage-ctf-form"
            (ngSubmit)="submitPassword()"
            aria-labelledby="garage-ctf-heading"
          >
            <h2
              id="garage-ctf-heading"
              class="garage-ctf-form__heading"
              i18n="Garage CTF heading@@garageCTFHeading"
            >
              輸入解鎖密碼
            </h2>

            <div class="garage-ctf-form__field">
              <label class="field field--wide">
                <span i18n="Garage password label@@garagePasswordLabel">密碼</span>
                <div class="garage-ctf-form__input-row">
                  <input
                    id="garage-password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    name="password"
                    autocomplete="off"
                    aria-required="true"
                    [attr.aria-describedby]="errorMessage() ? 'garage-error' : null"
                    i18n-placeholder="Garage password placeholder@@garagePasswordPlaceholder"
                    placeholder="輸入密碼…"
                  />
                  <button
                    type="button"
                    class="button button--secondary garage-ctf-form__toggle"
                    (click)="toggleShowPassword()"
                    [attr.aria-label]="showPassword() ? hidePasswordLabel : showPasswordLabel"
                    [attr.aria-pressed]="showPassword()"
                  >
                    {{ showPassword() ? hidePasswordText : showPasswordText }}
                  </button>
                </div>
              </label>
            </div>

            @if (errorMessage()) {
              <p id="garage-error" class="field__error" role="alert" aria-live="assertive">
                {{ errorMessage() }}
              </p>
            }

            <button
              type="submit"
              class="button button--primary garage-ctf-form__submit"
              [disabled]="submitting() || !password.trim()"
            >
              @if (submitting()) {
                <span i18n="Garage submitting button@@garageSubmittingButton">解鎖中…</span>
              } @else {
                <span i18n="Garage submit button@@garageSubmitButton">解鎖車庫</span>
              }
            </button>
          </form>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .garage-intro {
        color: var(--color-text-muted);
        line-height: 1.6;
        margin-bottom: 1.5rem;
        max-width: 42rem;
      }

      .garage-status-panel {
        max-width: 32rem;
      }

      .garage-status-panel p {
        margin: 0;
        line-height: 1.6;
      }

      .garage-solved {
        padding: 2rem 1.5rem;
        text-align: center;
      }

      .garage-solved__label {
        color: var(--color-text-muted);
        margin: 0 0 0.5rem;
      }

      .garage-solved__name {
        color: var(--color-gold);
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0;
      }

      .garage-ctf-form {
        max-width: 28rem;
        padding: 2rem 1.5rem;
      }

      .garage-ctf-form__heading {
        color: var(--color-gold);
        letter-spacing: 0.08em;
        margin: 0 0 1.5rem;
        text-transform: uppercase;
      }

      .garage-ctf-form__field {
        margin-bottom: 1rem;
      }

      .garage-ctf-form__input-row {
        align-items: center;
        display: grid;
        gap: 0.5rem;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .garage-ctf-form__toggle {
        min-width: 4.5rem;
        padding: 0 var(--space-3);
      }

      .garage-ctf-form__submit {
        margin-top: 0.5rem;
        width: 100%;
      }
    `,
  ],
})
export class GaragePageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  protected readonly status = signal<GarageCTFStatus | null>(null);
  protected readonly statusLoadError = signal('');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected password = '';

  protected readonly showPasswordLabel = $localize`:Garage show password aria@@garageShowPasswordAria:顯示密碼`;
  protected readonly hidePasswordLabel = $localize`:Garage hide password aria@@garageHidePasswordAria:隱藏密碼`;
  protected readonly showPasswordText = $localize`:Garage show password toggle@@garageShowPasswordToggle:顯示`;
  protected readonly hidePasswordText = $localize`:Garage hide password toggle@@garageHidePasswordToggle:隱藏`;

  ngOnInit(): void {
    this.loadStatus();
  }

  protected toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submitPassword(): void {
    const pw = this.password.trim();
    if (this.submitting()) {
      return;
    }

    if (!pw) {
      this.errorMessage.set(
        $localize`:Garage empty password error@@garageEmptyPasswordError:請先輸入密碼。`,
      );
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.http
      .post<GarageCTFStatus>(`${this.apiBaseUrl}/easter-eggs/garage-ctf/solve`, {
        password: pw,
      })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const code = readApiErrorCode(err);
          if (code === 'CONFLICT') {
            this.errorMessage.set(
              $localize`:Garage already solved error@@garageAlreadySolvedError:此關卡已被解鎖，無法再次提交。`,
            );
            this.loadStatus();
          } else {
            this.errorMessage.set(
              $localize`:Garage wrong password error@@garageWrongPasswordError:密碼錯誤，請再試一次。`,
            );
          }
          this.submitting.set(false);
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.status.set(result);
          this.password = '';
        }
        this.submitting.set(false);
      });
  }

  private loadStatus(): void {
    this.statusLoadError.set('');
    this.http
      .get<GarageCTFStatus>(`${this.apiBaseUrl}/easter-eggs/garage-ctf`)
      .pipe(
        catchError(() => {
          this.statusLoadError.set(
            $localize`:Garage status load error@@garageStatusLoadError:無法讀取車庫狀態，請稍後再試。`,
          );
          return of(null);
        }),
      )
      .subscribe((s) => this.status.set(s));
  }
}

function readApiErrorCode(error: HttpErrorResponse): string | undefined {
  const payload = error.error as { readonly error?: { readonly code?: string } } | null;
  return payload?.error?.code;
}
