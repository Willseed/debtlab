import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GaragePageComponent } from './garage-page.component';

describe('GaragePageComponent', () => {
  let fixture: ComponentFixture<GaragePageComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GaragePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(GaragePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('shows a mobile-friendly password reveal control and submits the CTF answer', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: false,
      solvedAt: null,
      firstSolverDisplayName: null,
    });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#garage-password') as HTMLInputElement;
    expect(input.type).toBe('password');

    clickButton('顯示');
    fixture.detectChanges();
    expect(input.type).toBe('text');

    input.value = 'SystmeLab';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (fixture.componentInstance as unknown as { password: string }).password = 'SystmeLab';
    fixture.detectChanges();

    const submitButton = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submitButton.disabled).toBeFalse();
    submitButton.click();

    const request = http.expectOne('/api/easter-eggs/garage-ctf/solve');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ password: 'SystmeLab' });
    request.flush({
      solved: true,
      solvedAt: '2026-06-15 10:00:00',
      firstSolverDisplayName: 'Bob',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bob');
    expect(fixture.nativeElement.querySelector('#garage-password')).toBeNull();
  });

  it('hides password submission after the CTF has already been solved', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: true,
      solvedAt: '2026-06-15 10:00:00',
      firstSolverDisplayName: 'Alice',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Alice');
    expect(fixture.nativeElement.querySelector('#garage-password')).toBeNull();
  });

  it('surfaces status load failures', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/easter-eggs/garage-ctf')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('無法讀取車庫狀態');
  });

  it('validates empty submissions before touching the API', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: false,
      solvedAt: null,
      firstSolverDisplayName: null,
    });

    (fixture.componentInstance as unknown as { submitPassword(): void }).submitPassword();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('請先輸入密碼');
  });

  it('ignores duplicate submissions while a solve request is already in flight', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: false,
      solvedAt: null,
      firstSolverDisplayName: null,
    });
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      password: string;
      submitting: { set(value: boolean): void };
      submitPassword(): void;
    };
    component.password = 'SystmeLab';
    component.submitting.set(true);
    component.submitPassword();

    expect(fixture.nativeElement.textContent).toContain('輸入解鎖密碼');
    http.expectNone('/api/easter-eggs/garage-ctf/solve');
  });

  it('handles incorrect CTF passwords', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: false,
      solvedAt: null,
      firstSolverDisplayName: null,
    });

    (fixture.componentInstance as unknown as { password: string }).password = 'wrong';
    (fixture.componentInstance as unknown as { submitPassword(): void }).submitPassword();

    http
      .expectOne('/api/easter-eggs/garage-ctf/solve')
      .flush(
        { error: { code: 'VALIDATION_ERROR', message: 'Incorrect password.', details: {} } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('密碼錯誤');
  });

  it('locks the form when another user solves first', () => {
    fixture.detectChanges();
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: false,
      solvedAt: null,
      firstSolverDisplayName: null,
    });

    (fixture.componentInstance as unknown as { password: string }).password = 'SystmeLab';
    (fixture.componentInstance as unknown as { submitPassword(): void }).submitPassword();

    http
      .expectOne('/api/easter-eggs/garage-ctf/solve')
      .flush(
        { error: { code: 'CONFLICT', message: 'Already solved.', details: {} } },
        { status: 409, statusText: 'Conflict' },
      );
    http.expectOne('/api/easter-eggs/garage-ctf').flush({
      solved: true,
      solvedAt: '2026-06-15 10:00:00',
      firstSolverDisplayName: 'Alice',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Alice');
    expect(fixture.nativeElement.querySelector('#garage-password')).toBeNull();
  });
});

function clickButton(label: string): void {
  const buttons = Array.from(document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
  const button = buttons.find((candidate) => candidate.textContent?.includes(label));
  expect(button).withContext(`button ${label}`).toBeTruthy();
  button?.click();
}
