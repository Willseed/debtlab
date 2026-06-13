import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  let fixture: ComponentFixture<LandingPageComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    isAuthenticated = signal(false);
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['startGoogleSignIn']);
    Object.assign(authService, { isAuthenticated });

    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
  });

  it('starts Google sign-in when the Google button is clicked', () => {
    const button = fixture.nativeElement.querySelector('.button--primary') as HTMLButtonElement;

    button.click();

    expect(authService.startGoogleSignIn).toHaveBeenCalledOnceWith();
  });

  it('hides login buttons from authenticated users', () => {
    isAuthenticated.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('使用 Google 繼續');
    expect(compiled.textContent).toContain('前往儀表板');
  });
});
