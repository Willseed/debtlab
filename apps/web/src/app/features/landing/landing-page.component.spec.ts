import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  let fixture: ComponentFixture<LandingPageComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['startGoogleSignIn']);

    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
  });

  it('starts Google sign-in when the Google button is clicked', () => {
    const button = fixture.nativeElement.querySelector('.button--primary') as HTMLButtonElement;

    button.click();

    expect(authService.startGoogleSignIn).toHaveBeenCalledOnceWith();
  });
});
