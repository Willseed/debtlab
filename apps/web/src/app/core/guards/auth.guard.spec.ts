import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';

describe('route guards', () => {
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;
  let router: Router;

  beforeEach(() => {
    isAuthenticated = signal(false);
    isAdmin = signal(false);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            isAdmin,
          } satisfies Pick<AuthService, 'isAuthenticated' | 'isAdmin'>,
        },
      ],
    });

    router = TestBed.inject(Router);
  });

  it('allows authenticated users through authGuard', () => {
    isAuthenticated.set(true);

    expect(runGuard(authGuard)).toBeTrue();
  });

  it('redirects guests from authenticated routes to landing', () => {
    expect(runGuard(authGuard)).toEqual(router.createUrlTree(['/']));
  });

  it('redirects authenticated users away from the landing route', () => {
    isAuthenticated.set(true);

    expect(runGuard(guestGuard)).toEqual(router.createUrlTree(['/dashboard']));
  });

  it('allows guests through guestGuard', () => {
    expect(runGuard(guestGuard)).toBeTrue();
  });

  it('redirects guests from admin routes to landing', () => {
    expect(runGuard(adminGuard)).toEqual(router.createUrlTree(['/']));
  });

  it('redirects authenticated non-admin users from admin routes to dashboard', () => {
    isAuthenticated.set(true);

    expect(runGuard(adminGuard)).toEqual(router.createUrlTree(['/dashboard']));
  });

  it('allows admins through adminGuard', () => {
    isAuthenticated.set(true);
    isAdmin.set(true);

    expect(runGuard(adminGuard)).toBeTrue();
  });
});

function runGuard(guard: typeof authGuard) {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}
