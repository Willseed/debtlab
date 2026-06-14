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
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['startGoogleSignIn']);
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

    const button = fixture.nativeElement.querySelector('.button--primary') as HTMLButtonElement;

    button.click();

    expect(authService.startGoogleSignIn).toHaveBeenCalledOnceWith();
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
    expect(compiled.textContent).toContain('前往儀表板');
  });

  it('shows an inactive-user Google auth error from the callback redirect', () => {
    authErrorCode = 'user_not_active';
    createComponent();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('Google 登入未完成：你的帳號已停用，請聯絡管理員。');
  });

  it('shows a generic Google auth error from the callback redirect', () => {
    authErrorCode = 'google_verification_failed';
    createComponent();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(alert.textContent).toContain('Google 登入未完成，請稍後再試或聯絡管理員。');
  });
});
