import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject, throwError } from 'rxjs';

import { AuthService, BROWSER_WINDOW } from '../../core/auth/auth.service';
import { CurrentUser } from '../../shared/models/current-user.model';
import { ACTIVATION_INVITE_STORAGE_KEY, ActivatePageComponent } from './activate-page.component';

describe('ActivatePageComponent', () => {
  const activeUser: CurrentUser = {
    id: 'usr_active',
    email: 'member@example.com',
    displayName: 'Active Member',
    role: 'member',
    status: 'active',
  };

  let fixture: ComponentFixture<ActivatePageComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let sessionStorage: jasmine.SpyObj<Storage>;
  let activatedRoute: ActivatedRoute;
  let queryParams: Record<string, string>;

  beforeEach(async () => {
    queryParams = {};
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'activate',
      'startGoogleSignIn',
      'startAppleSignIn',
    ]);
    authService.activate.and.returnValue(new Subject<CurrentUser>());
    router = jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl']);
    router.navigate.and.resolveTo(true);
    router.navigateByUrl.and.resolveTo(true);
    sessionStorage = jasmine.createSpyObj<Storage>('sessionStorage', [
      'getItem',
      'removeItem',
      'setItem',
    ]);
    sessionStorage.getItem.and.returnValue(null);
    activatedRoute = {
      snapshot: {
        get queryParamMap() {
          return convertToParamMap(queryParams);
        },
      },
    } as ActivatedRoute;

    await TestBed.configureTestingModule({
      imports: [ActivatePageComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: activatedRoute },
        { provide: Router, useValue: router },
        { provide: BROWSER_WINDOW, useValue: { sessionStorage } as unknown as Window },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(ActivatePageComponent);
    fixture.detectChanges();
  }

  function inviteInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[formcontrolname="inviteCode"]');
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]');
  }

  function alertText(): string {
    return (
      (fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null)?.textContent ??
      ''
    ).trim();
  }

  function setInviteCode(value: string): void {
    const input = inviteInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    submitButton().click();
    fixture.detectChanges();
  }

  it('autofills an invite query and clears the URL query string', () => {
    queryParams = { invite: ' INVITE-123 ' };

    createComponent();

    expect(inviteInput().type).toBe('password');
    expect(inviteInput().value).toBe('INVITE-123');
    expect(router.navigate).toHaveBeenCalledOnceWith([], {
      relativeTo: activatedRoute,
      queryParams: {},
      replaceUrl: true,
    });
    expect(authService.activate).not.toHaveBeenCalled();
  });

  it('autofills a code query alias and clears stale stored invites', () => {
    queryParams = { code: 'JOIN-456' };

    createComponent();

    expect(inviteInput().value).toBe('JOIN-456');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(ACTIVATION_INVITE_STORAGE_KEY);
    expect(router.navigate).toHaveBeenCalledOnceWith([], {
      relativeTo: activatedRoute,
      queryParams: {},
      replaceUrl: true,
    });
  });

  it('clears an empty invite query without filling the form', () => {
    queryParams = { invite: '' };

    createComponent();

    expect(inviteInput().value).toBe('');
    expect(router.navigate).toHaveBeenCalledOnceWith([], {
      relativeTo: activatedRoute,
      queryParams: {},
      replaceUrl: true,
    });
  });

  it('reads a preserved invite from session storage and removes it', () => {
    sessionStorage.getItem.and.returnValue('STORED-789');

    createComponent();

    expect(inviteInput().value).toBe('STORED-789');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(ACTIVATION_INVITE_STORAGE_KEY);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps the form usable when session storage cannot be read', () => {
    sessionStorage.getItem.and.throwError('storage blocked');

    createComponent();

    expect(inviteInput().value).toBe('');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('requires a manual invite code before activation', () => {
    createComponent();

    submit();

    expect(authService.activate).not.toHaveBeenCalled();
    expect(alertText()).toContain('請先輸入邀請碼。');
  });

  it('preserves the invite for Google sign-in with session storage only', () => {
    queryParams = { invite: 'LOGIN-CODE' };
    createComponent();

    const googleButton = fixture.nativeElement.querySelector(
      '.oauth-button--google',
    ) as HTMLButtonElement | null;
    expect(googleButton).toBeNull();

    setInviteCode('LOGIN-CODE');
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            statusText: 'Unauthorized',
            error: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          }),
      ),
    );
    submit();

    const promptedGoogleButton = fixture.nativeElement.querySelector(
      '.oauth-button--google',
    ) as HTMLButtonElement;
    promptedGoogleButton.click();

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      ACTIVATION_INVITE_STORAGE_KEY,
      'LOGIN-CODE',
    );
    expect(authService.startGoogleSignIn).toHaveBeenCalledOnceWith();
  });

  it('removes the preserved invite before Apple sign-in when the form is empty', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            statusText: 'Unauthorized',
            error: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          }),
      ),
    );
    createComponent();
    setInviteCode('LOGIN-FIRST');
    submit();
    setInviteCode(' ');

    const appleButton = fixture.nativeElement.querySelector(
      '.oauth-button--apple',
    ) as HTMLButtonElement;
    appleButton.click();

    expect(sessionStorage.removeItem).toHaveBeenCalledWith(ACTIVATION_INVITE_STORAGE_KEY);
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    expect(authService.startAppleSignIn).toHaveBeenCalledOnceWith();
  });

  it('navigates to the dashboard after successful activation', () => {
    const activation = new Subject<CurrentUser>();
    authService.activate.and.returnValue(activation);
    createComponent();
    setInviteCode('GOOD-CODE');

    submit();

    expect(authService.activate).toHaveBeenCalledOnceWith('GOOD-CODE');
    activation.next(activeUser);
    activation.complete();
    fixture.detectChanges();

    expect(sessionStorage.removeItem).toHaveBeenCalledWith(ACTIVATION_INVITE_STORAGE_KEY);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/dashboard');
  });

  it('shows the wrong invite message without echoing the invite code', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            statusText: 'Unprocessable Entity',
            error: {
              error: {
                code: 'INVITE_CODE_INVALID',
                message: '邀請碼不正確或已失效。',
                details: {},
              },
            },
          }),
      ),
    );
    createComponent();
    setInviteCode('BAD-CODE');

    submit();

    expect(alertText()).toContain('邀請碼不正確或已失效。');
    expect(alertText()).not.toContain('BAD-CODE');
  });

  it('shows a retry countdown for rate-limited activation', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            statusText: 'Too Many Requests',
            error: {
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many attempts.',
                details: { retryAfterSeconds: 37, limit: 5, windowSeconds: 60 },
              },
            },
          }),
      ),
    );
    createComponent();
    setInviteCode('RATE-CODE');

    submit();

    expect(alertText()).toContain('請等待 37 秒後再試');
    expect(submitButton().disabled).toBeTrue();
  });

  it('uses Retry-After when the rate limit details do not include seconds', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            headers: new HttpHeaders({ 'Retry-After': '12' }),
            error: {
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many attempts.',
                details: {},
              },
            },
          }),
      ),
    );
    createComponent();
    setInviteCode('HEADER-CODE');

    submit();

    expect(alertText()).toContain('請等待 12 秒後再試');
  });

  it('shows a generic rate-limit message when retry seconds are absent', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            statusText: 'Too Many Requests',
            error: {
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many attempts.',
                details: {},
              },
            },
          }),
      ),
    );
    createComponent();
    setInviteCode('RATE-CODE');

    submit();

    expect(alertText()).toContain('嘗試次數太多，請稍後再試。');
    expect(submitButton().disabled).toBeFalse();
  });

  it('clears the retry countdown when it reaches zero', fakeAsync(() => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            statusText: 'Too Many Requests',
            error: {
              error: {
                code: 'RATE_LIMITED',
                message: 'Too many attempts.',
                details: { retryAfterSeconds: 1 },
              },
            },
          }),
      ),
    );
    createComponent();
    setInviteCode('RATE-CODE');
    submit();

    tick(1000);
    fixture.detectChanges();

    expect(alertText()).toBe('');
    expect(submitButton().disabled).toBeFalse();
  }));

  it('shows login actions after an unauthorized activation attempt', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            statusText: 'Unauthorized',
            error: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          }),
      ),
    );
    createComponent();
    setInviteCode('LOGIN-FIRST');

    submit();

    expect(alertText()).toContain('請先登入後再啟用邀請。');
    expect(fixture.nativeElement.querySelector('.oauth-button--google')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.oauth-button--apple')).not.toBeNull();
  });

  it('shows login actions when the API error code is unauthorized', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            statusText: 'Forbidden',
            error: { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          }),
      ),
    );
    createComponent();
    setInviteCode('LOGIN-FIRST');

    submit();

    expect(alertText()).toContain('請先登入後再啟用邀請。');
    expect(fixture.nativeElement.querySelector('.oauth-button--google')).not.toBeNull();
  });

  it('shows a generic activation message for unexpected errors', () => {
    authService.activate.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 500,
            statusText: 'Internal Server Error',
            error: 'boom',
          }),
      ),
    );
    createComponent();
    setInviteCode('UNKNOWN-CODE');

    submit();

    expect(alertText()).toContain('無法啟用邀請，請稍後再試。');
    expect(alertText()).not.toContain('UNKNOWN-CODE');
  });
});
