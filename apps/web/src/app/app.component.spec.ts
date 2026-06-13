import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';

describe('AppComponent', () => {
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    isAuthenticated = signal(false);
    isAdmin = signal(false);
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
          } satisfies Pick<AuthService, 'isAuthenticated' | 'isAdmin'>,
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the product shell brand', async () => {
    const compiled = await createComponent();

    expect(compiled.textContent).toContain('LabSplit Black Gold');
  });

  it('shows only public navigation to guests', async () => {
    const compiled = await createComponent();

    expect(compiled.textContent).toContain('首頁');
    expect(compiled.textContent).not.toContain('支出');
    expect(compiled.textContent).not.toContain('管理');
  });

  it('hides home and admin navigation from authenticated non-admin members', async () => {
    isAuthenticated.set(true);

    const compiled = await createComponent();

    expect(compiled.textContent).not.toContain('首頁');
    expect(compiled.textContent).toContain('儀表板');
    expect(compiled.textContent).toContain('支出');
    expect(compiled.textContent).not.toContain('管理');
  });

  it('shows admin navigation only to admins', async () => {
    isAuthenticated.set(true);
    isAdmin.set(true);

    const compiled = await createComponent();

    expect(compiled.textContent).toContain('管理');
  });
});
