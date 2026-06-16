import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import {
  MysteryChallengeLeaderboardEntry,
  MysteryChallengeState,
} from './mystery-challenge-api.service';
import { MysteryChallengePageComponent } from './mystery-challenge-page.component';

describe('MysteryChallengePageComponent', () => {
  let fixture: ComponentFixture<MysteryChallengePageComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MysteryChallengePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(MysteryChallengePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders challenge status, submission, and ordered leaderboard without exposing clues or hints', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [
        createEntry({ rank: 2, displayName: 'Bob', completedAt: '2026-06-15 10:05:00.000' }),
        createEntry({ rank: 1, displayName: 'Alice', completedAt: '2026-06-15T10:00:00+08:00' }),
      ],
    });
    fixture.detectChanges();

    const text = content();
    expect(text).toContain('神秘密碼挑戰');
    expect(text).toContain('挑戰狀態');
    expect(text).toContain('可提交');
    expect(text).toContain('提交答案');
    expect(text).toContain('原始密碼');
    expect(text).toContain('依完成名次排序');
    expect(text).not.toContain('[50, 783, 1047, 34048, 41957, 24]');
    expect(text).not.toContain('[50, 783, 1047, 34048, 30652, 23]');
    expect(text).not.toContain('[3320, 34048, 39660, 22]');
    expect(text).not.toContain('OpenAI');
    expect(text).not.toContain('Token 不是亂碼');
    expect(text).not.toContain('編碼線索');
    expect(text).not.toContain('o200k');
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Bob'));
    expect(text).toContain('2026/06/15 10:00');
  });

  it('submits once and closes the form after success', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    const post = http.expectOne('/api/mystery-challenge/submissions');
    expect(post.request.body).toEqual({ password: 'SystemLab0427' });
    post.flush({
      completed: true,
      completedAt: '2026-06-15 10:00:00.000',
      leaderboard: [createEntry({ displayName: 'Bob' })],
    });
    fixture.detectChanges();
    expect(content()).toContain('已完成挑戰');
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'completed', completed: true, claimedCount: 1 }));
    fixture.detectChanges();

    expect(content()).toContain('已完成挑戰');
    expect(fixture.nativeElement.querySelector('#mystery-password')).toBeNull();
    expect(content()).toContain('Bob');
  });

  it('hides input when completed or all passwords are claimed', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'completed', completed: true }));
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();
    expect(content()).toContain('你已完成挑戰');
    expect(fixture.nativeElement.querySelector('#mystery-password')).toBeNull();
  });

  it('hides input when the challenge is unavailable', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'unavailable', availableCount: 0, claimedCount: 2 }));
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    expect(content()).toContain('挑戰目前不可用');
    expect(fixture.nativeElement.querySelector('#mystery-password')).toBeNull();
  });

  it('hides input when the challenge is closed', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'closed', availableCount: 1, claimedCount: 2 }));
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    expect(content()).toContain('挑戰已關閉');
    expect(fixture.nativeElement.querySelector('#mystery-password')).toBeNull();
  });

  it('hides input when every password is claimed', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'completed', availableCount: 0, claimedCount: 3 }));
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    expect(content()).toContain('三組密碼皆已被領取');
    expect(fixture.nativeElement.querySelector('#mystery-password')).toBeNull();
  });

  it('shows loading failures and empty leaderboard state', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/mystery-challenge')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    expect(content()).toContain('挑戰狀態無法讀取');
    expect(content()).toContain('目前還沒有人完成挑戰');
  });

  it('shows leaderboard loading failures without hiding the challenge submission area', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http
      .expectOne('/api/mystery-challenge/leaderboard')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect(content()).toContain('無法載入排行榜');
    expect(content()).toContain('提交答案');
    expect(content()).toContain('原始密碼');
    expect(content()).not.toContain('[50, 783, 1047, 34048, 41957, 24]');
  });

  it('renders unparseable completion timestamps as provided by the API', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [
        createEntry({ displayName: 'Pending', completedAt: 'pending-clock-sync' }),
        createEntry({ displayName: 'Synced', completedAt: '2026-06-15 10:00:00.000' }),
      ],
    });
    fixture.detectChanges();

    expect(content().indexOf('Synced')).toBeLessThan(content().indexOf('Pending'));
    expect(content()).toContain('pending-clock-sync');
  });

  it('keeps a valid timestamp ahead when rank ties and the invalid timestamp arrives second', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [
        createEntry({ rank: 1, displayName: 'Synced', completedAt: '2026-06-15 10:00:00.000' }),
        createEntry({ rank: 1, displayName: 'Pending', completedAt: 'pending-clock-sync' }),
      ],
    });
    fixture.detectChanges();

    expect(content().indexOf('Synced')).toBeLessThan(content().indexOf('Pending'));
  });

  it('orders unparseable tied ranks by timestamp text and then display name', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [
        createEntry({ rank: 1, displayName: 'Charlie', completedAt: 'pending-clock-sync' }),
        createEntry({ rank: 1, displayName: 'Alice', completedAt: 'pending-clock-sync' }),
        createEntry({ rank: 1, displayName: 'Beta', completedAt: 'another-clock-sync' }),
      ],
    });
    fixture.detectChanges();

    const text = content();
    expect(text.indexOf('Beta')).toBeLessThan(text.indexOf('Alice'));
    expect(text.indexOf('Alice')).toBeLessThan(text.indexOf('Charlie'));
  });

  it('uses display name as the final deterministic leaderboard tiebreaker', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [
        createEntry({ rank: 1, displayName: 'Charlie', completedAt: '2026-06-15T10:00:00+08:00' }),
        createEntry({ rank: 1, displayName: 'Alice', completedAt: '2026-06-15T10:00:00+08:00' }),
      ],
    });
    fixture.detectChanges();

    expect(content().indexOf('Alice')).toBeLessThan(content().indexOf('Charlie'));
  });

  it('handles invalid and conflict submissions', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('wrong');
    clickSubmit();
    http.expectOne('/api/mystery-challenge/submissions').flush(
      {
        error: { code: 'VALIDATION_ERROR', message: 'Submission was not accepted.', details: {} },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();
    expect(content()).toContain('密碼錯誤或已被使用');

    setPassword('SystmeLab0619');
    clickSubmit();
    http
      .expectOne('/api/mystery-challenge/submissions')
      .flush(
        { error: { code: 'CONFLICT', message: 'Already completed.', details: {} } },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(content()).toContain('你已完成挑戰，或這組密碼已被領取');
    http
      .expectOne('/api/mystery-challenge')
      .flush(createChallengeState({ status: 'completed', completed: true, claimedCount: 1 }));
    http.expectOne('/api/mystery-challenge/leaderboard').flush({
      leaderboard: [createEntry({ displayName: 'Alice' })],
    });
    fixture.detectChanges();
    expect(content()).toContain('提交已關閉');
  });

  it('validates blank submissions before calling the API', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('   ');
    clickSubmit();
    fixture.detectChanges();

    http.expectNone('/api/mystery-challenge/submissions');
    expect(content()).toContain('請先輸入原始密碼');
  });

  it('shows auth and generic submission failures', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    http
      .expectOne('/api/mystery-challenge/submissions')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required.', details: {} } },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();
    expect(content()).toContain('登入狀態已失效');

    setPassword('SystemLab0427');
    clickSubmit();
    http
      .expectOne('/api/mystery-challenge/submissions')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();
    expect(content()).toContain('無法提交密碼');
  });

  it('shows retry timing for RATE_LIMITED and HTTP 429 submission errors', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    http.expectOne('/api/mystery-challenge/submissions').flush(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts.',
          details: { retryAfterSeconds: 5 },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(content()).toContain('嘗試次數太多，請等待 5 秒後再試。');

    tick(5000);
    fixture.detectChanges();

    clickSubmit();
    http.expectOne('/api/mystery-challenge/submissions').flush(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Too many attempts.',
          details: { retryAfterSeconds: 4 },
        },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();
    expect(content()).toContain('嘗試次數太多，請等待 4 秒後再試。');

    tick(4000);
    fixture.detectChanges();
  }));

  it('shows a generic rate limit message when retry timing is missing', () => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    http
      .expectOne('/api/mystery-challenge/submissions')
      .flush(
        { error: { code: 'RATE_LIMITED', message: 'Too many attempts.', details: {} } },
        { status: 429, statusText: 'Too Many Requests' },
      );
    fixture.detectChanges();

    expect(content()).toContain('嘗試次數太多，請稍後再試。');
    expect(submitButton().disabled).toBeFalse();
  });

  it('accepts string retry timing from RATE_LIMITED details', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    http.expectOne('/api/mystery-challenge/submissions').flush(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts.',
          details: { retryAfterSeconds: '2' },
        },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(content()).toContain('嘗試次數太多，請等待 2 秒後再試。');
    expect(submitButton().disabled).toBeTrue();

    tick(2000);
    fixture.detectChanges();
  }));

  it('disables submission and updates the countdown button until retry delay ends', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne('/api/mystery-challenge').flush(createChallengeState());
    http.expectOne('/api/mystery-challenge/leaderboard').flush({ leaderboard: [] });
    fixture.detectChanges();

    setPassword('SystemLab0427');
    clickSubmit();
    http.expectOne('/api/mystery-challenge/submissions').flush(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts.',
          details: { retryAfterSeconds: 3 },
        },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(submitButton().disabled).toBeTrue();
    expect(submitButton().textContent).toContain('請等待 3 秒');

    tick(1000);
    fixture.detectChanges();
    expect(submitButton().disabled).toBeTrue();
    expect(submitButton().textContent).toContain('請等待 2 秒');

    tick(2000);
    fixture.detectChanges();
    expect(submitButton().disabled).toBeFalse();
    expect(submitButton().textContent).toContain('提交密碼');
    expect(submitButton().textContent).not.toContain('請等待');

    tick(2000);
    fixture.detectChanges();
    expect(submitButton().disabled).toBeFalse();
  }));

  function setPassword(value: string): void {
    const input = fixture.nativeElement.querySelector('#mystery-password') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function clickSubmit(): void {
    const button = submitButton();
    expect(button.disabled).toBeFalse();
    button.click();
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  function content(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }
});

function createChallengeState(
  overrides: Partial<MysteryChallengeState> = {},
): MysteryChallengeState {
  return {
    status: 'active',
    completed: false,
    completedAt: null,
    encodedPasswords: [
      {
        id: 'mystery-1',
        displayOrder: 1,
        encoding: 'o200k_base',
        tokens: [50, 783, 1047, 34048, 41957, 24],
        claimed: true,
        hint: {
          locale: 'zh-TW',
          title: '系統少了一個 e？',
          body: '招聘題不急著猜答案：先看見拼字裡的缺口，再把 06/19 放回實驗室。',
        },
      },
      {
        id: 'mystery-2',
        displayOrder: 2,
        encoding: 'o200k_base',
        tokens: [50, 783, 1047, 34048, 30652, 23],
        claimed: false,
        hint: {
          locale: 'zh-TW',
          title: 'Token 不是亂碼',
          body: '像徵才廣告裡的訊號題：把 o200k 數列還原，02/28 會對上第二扇門。',
        },
      },
      {
        id: 'mystery-3',
        displayOrder: 3,
        encoding: 'o200k_base',
        tokens: [3320, 34048, 39660, 22],
        claimed: false,
        hint: {
          locale: 'zh-TW',
          title: 'System 回到正軌',
          body: '最後一題像面試官的追問：當 System 拼對了，04/27 會把你送上排行榜。',
        },
      },
    ],
    claimedCount: 1,
    availableCount: 2,
    ...overrides,
  };
}

function createEntry(
  overrides: Partial<MysteryChallengeLeaderboardEntry> = {},
): MysteryChallengeLeaderboardEntry {
  return {
    rank: 1,
    displayName: 'Bob',
    completedAt: '2026-06-15 10:00:00.000',
    ...overrides,
  };
}
