import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  let fixture: ComponentFixture<LandingPageComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let authErrorCode: string | null;

  beforeEach(async () => {
    isAuthenticated = signal(false);
    authErrorCode = null;
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'startGoogleSignIn',
      'startAppleSignIn',
    ]);
    Object.assign(authService, { isAuthenticated });

    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(authErrorCode ? { auth_error: authErrorCode } : {});
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
  }

  it('starts Google sign-in when the Google button is clicked', () => {
    createComponent();

    const button = fixture.nativeElement.querySelector(
      '.oauth-button--google',
    ) as HTMLButtonElement;

    button.click();

    expect(authService.startGoogleSignIn).toHaveBeenCalledOnceWith();
  });

  it('starts Apple sign-in when the Apple button is clicked', () => {
    createComponent();

    const button = fixture.nativeElement.querySelector('.oauth-button--apple') as HTMLButtonElement;

    button.click();

    expect(authService.startAppleSignIn).toHaveBeenCalledOnceWith();
  });

  it('renders enabled large official-style Google and Apple sign-in buttons', () => {
    createComponent();

    const providerGroup = fixture.nativeElement.querySelector(
      '.hero-band__login-actions',
    ) as HTMLElement;
    const googleButton = fixture.nativeElement.querySelector(
      '.oauth-button--google',
    ) as HTMLButtonElement;
    const appleButton = fixture.nativeElement.querySelector(
      '.oauth-button--apple',
    ) as HTMLButtonElement;
    const googleLabel = fixture.nativeElement.querySelector(
      '#landing-google-login-label',
    ) as HTMLElement;
    const appleLabel = fixture.nativeElement.querySelector(
      '#landing-apple-login-label',
    ) as HTMLElement;

    expect(providerGroup.getAttribute('role')).toBe('group');
    expect(providerGroup.getAttribute('aria-label')).toBe('登入提供者');
    expect(googleButton).withContext('Google button').not.toBeNull();
    expect(appleButton).withContext('Apple button').not.toBeNull();
    expect(googleButton.disabled).toBeFalse();
    expect(appleButton.disabled).toBeFalse();
    expect(googleButton.getAttribute('aria-labelledby')).toBe('landing-google-login-label');
    expect(appleButton.getAttribute('aria-labelledby')).toBe('landing-apple-login-label');
    expect(googleButton.textContent?.trim()).toBe('使用 Google 繼續');
    expect(appleButton.textContent?.trim()).toBe('使用 Apple 繼續');
    expect(googleLabel.textContent?.trim()).toBe('使用 Google 繼續');
    expect(appleLabel.textContent?.trim()).toBe('使用 Apple 繼續');
  });

  it('renders the public OAuth-gated landing subtitle', () => {
    createComponent();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('給任何人使用的共同支出拆帳儀表板。');
  });

  it('hides login buttons from authenticated users', () => {
    createComponent();

    isAuthenticated.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('使用 Google 繼續');
    expect(compiled.textContent).not.toContain('使用 Apple 繼續');
    expect(compiled.textContent).toContain('前往儀表板');
  });

  it('shows an inactive-user auth error from the callback redirect', () => {
    authErrorCode = 'user_not_active';
    createComponent();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('登入未完成：你的帳號已停用，請聯絡管理員。');
  });

  it('shows a generic auth error from the callback redirect', () => {
    authErrorCode = 'google_verification_failed';
    createComponent();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('登入未完成，請稍後再試或聯絡管理員。');
  });
});
