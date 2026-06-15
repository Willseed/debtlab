import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MysteryChallengeApiService, MysteryChallengeState } from './mystery-challenge-api.service';

describe('MysteryChallengeApiService', () => {
  let service: MysteryChallengeApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MysteryChallengeApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the authenticated challenge state', () => {
    const response = createChallengeState();
    let result: MysteryChallengeState | undefined;

    service.getChallengeState().subscribe((state) => (result = state));

    const request = http.expectOne('/api/mystery-challenge');
    expect(request.request.method).toBe('GET');
    request.flush(response);
    expect(result).toEqual(response);
  });

  it('loads the leaderboard and submits a decoded password', () => {
    service.getLeaderboard().subscribe();
    expect(http.expectOne('/api/mystery-challenge/leaderboard').request.method).toBe('GET');

    service.submitPassword('SystemLab0427').subscribe();
    const post = http.expectOne('/api/mystery-challenge/submissions');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ password: 'SystemLab0427' });
  });
});

function createChallengeState(): MysteryChallengeState {
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
        claimed: false,
        hint: {
          locale: 'zh-TW',
          title: '系統少了一個 e？',
          body: '招聘題不急著猜答案：先看見拼字裡的缺口，再把 06/19 放回實驗室。',
        },
      },
    ],
    claimedCount: 0,
    availableCount: 1,
  };
}
