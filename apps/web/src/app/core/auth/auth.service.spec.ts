import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CurrentUser } from '../../shared/models/current-user.model';
import { AuthService, BROWSER_WINDOW } from './auth.service';

describe('AuthService', () => {
  const adminUser: CurrentUser = {
    id: 'usr_admin',
    email: 'admin@example.com',
    displayName: 'Admin User',
    role: 'admin',
    status: 'active',
  };

  let authService: AuthService;
  let http: HttpTestingController;
  let locationAssign: jasmine.Spy;

  beforeEach(() => {
    locationAssign = jasmine.createSpy('assign');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: BROWSER_WINDOW,
          useValue: { location: { assign: locationAssign } } as unknown as Window,
        },
      ],
    });

    authService = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('refreshes and exposes the authenticated admin user', () => {
    let result: CurrentUser | null | undefined;

    authService.refresh().subscribe((user) => {
      result = user;
    });

    http.expectOne('/api/auth/me').flush({ user: adminUser });

    expect(result).toEqual(adminUser);
    expect(authService.currentUser()).toEqual(adminUser);
    expect(authService.isAuthenticated()).toBeTrue();
    expect(authService.isAdmin()).toBeTrue();
  });

  it('clears the current user when refresh fails', () => {
    let result: CurrentUser | null | undefined;

    authService.refresh().subscribe((user) => {
      result = user;
    });

    http.expectOne('/api/auth/me').flush(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.',
          details: {},
        },
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(result).toBeNull();
    expect(authService.currentUser()).toBeNull();
    expect(authService.isAuthenticated()).toBeFalse();
    expect(authService.isAdmin()).toBeFalse();
  });

  it('starts the Google backend OAuth flow', () => {
    authService.startGoogleSignIn();

    expect(locationAssign).toHaveBeenCalledOnceWith('/api/auth/google/start');
  });

  it('starts the Apple backend OAuth flow', () => {
    authService.startAppleSignIn();

    expect(locationAssign).toHaveBeenCalledOnceWith('/api/auth/apple/start');
  });

  it('activates an invite and exposes the active current user', () => {
    const activeUser: CurrentUser = {
      ...adminUser,
      status: 'active',
    };
    let result: CurrentUser | undefined;

    authService.activate('INVITE-CODE').subscribe((user) => {
      result = user;
    });

    const request = http.expectOne('/api/auth/activate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ inviteCode: 'INVITE-CODE' });
    request.flush({ user: activeUser });

    expect(result).toEqual(activeUser);
    expect(authService.currentUser()).toEqual(activeUser);
    expect(authService.isAuthenticated()).toBeTrue();
  });

  it('clears the current user after successful sign out', () => {
    authService.refresh().subscribe();
    http.expectOne('/api/auth/me').flush({ user: adminUser });

    let result: boolean | undefined;
    authService.signOut().subscribe((isSignedOut) => {
      result = isSignedOut;
    });

    http.expectOne('/api/auth/logout').flush({ ok: true });

    expect(result).toBeTrue();
    expect(authService.currentUser()).toBeNull();
  });

  it('keeps the current user when sign out is not acknowledged', () => {
    authService.refresh().subscribe();
    http.expectOne('/api/auth/me').flush({ user: adminUser });

    let result: boolean | undefined;
    authService.signOut().subscribe((isSignedOut) => {
      result = isSignedOut;
    });

    http.expectOne('/api/auth/logout').flush({ ok: false });

    expect(result).toBeFalse();
    expect(authService.currentUser()).toEqual(adminUser);
  });
});

describe('BROWSER_WINDOW', () => {
  it('uses the global browser window by default', () => {
    TestBed.configureTestingModule({});

    expect(TestBed.inject(BROWSER_WINDOW)).toBe(globalThis.window);
  });
});
