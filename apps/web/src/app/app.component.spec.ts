import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';

describe('AppComponent', () => {
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;
  let signOutSpy: jasmine.Spy;

  beforeEach(() => {
    isAuthenticated = signal(false);
    isAdmin = signal(false);
    signOutSpy = jasmine.createSpy('signOut').and.returnValue(of(true));
  });

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            isAdmin,
            signOut: signOutSpy,
          } satisfies Pick<AuthService, 'isAuthenticated' | 'isAdmin' | 'signOut'>,
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the product shell brand', async () => {
    const fixture = await createComponent();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('LabSplit Black Gold');
  });

  it('shows only public navigation to guests', async () => {
    const fixture = await createComponent();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('首頁');
    expect(text).not.toContain('支出');
    expect(text).not.toContain('管理');
    expect(text).not.toContain('登出');
  });

  it('hides home and admin navigation from authenticated non-admin members', async () => {
    isAuthenticated.set(true);

    const fixture = await createComponent();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('首頁');
    expect(text).toContain('儀表板');
    expect(text).toContain('支出');
    expect(text).not.toContain('管理');
    expect(text).toContain('登出');
  });

  it('shows the disguised repository footer only to authenticated members', async () => {
    isAuthenticated.set(true);

    const fixture = await createComponent();
    const footer = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.app-shell__footer',
    );
    const repositoryLink = footer?.querySelector<HTMLAnchorElement>('.app-shell__repository-link');

    expect(footer).not.toBeNull();
    expect(repositoryLink).not.toBeNull();
    expect(repositoryLink?.textContent?.trim()).toBe('Copyright 2026');
    expect(footer?.textContent).not.toContain('github.com');
    expect(repositoryLink?.getAttribute('href')).toBe('https://github.com/Willseed/debtlab');
    expect(repositoryLink?.getAttribute('aria-label')).toBe('GitHub 程式碼庫');
  });

  it('does not show the repository footer to guests', async () => {
    const fixture = await createComponent();

    expect((fixture.nativeElement as HTMLElement).querySelector('.app-shell__footer')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Copyright 2026');
  });

  it('shows admin navigation only to admins', async () => {
    isAuthenticated.set(true);
    isAdmin.set(true);

    const fixture = await createComponent();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('管理');
  });

  it('signs out and navigates to the landing page when the sign-out button is clicked', async () => {
    isAuthenticated.set(true);

    const fixture = await createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.app-shell__signout',
    );

    expect(button).not.toBeNull();
    button?.click();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledOnceWith('/');
  });

  it('does not navigate when sign-out is not acknowledged by the backend', async () => {
    isAuthenticated.set(true);
    signOutSpy.and.returnValue(of(false));

    const fixture = await createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.app-shell__signout')
      ?.click();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('swallows landing-page navigation failures after sign-out', async () => {
    isAuthenticated.set(true);

    const fixture = await createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl').and.rejectWith(
      new Error('navigation failed'),
    );
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.app-shell__signout')
      ?.click();
    await fixture.whenStable();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledOnceWith('/');
  });
});
