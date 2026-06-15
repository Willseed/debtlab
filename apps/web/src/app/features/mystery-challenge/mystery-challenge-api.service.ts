import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type MysteryChallengePrompt = {
  readonly id: string;
  readonly displayOrder: number;
  readonly encoding: 'o200k_base';
  readonly tokens: readonly number[];
  readonly claimed: boolean;
  readonly hint: {
    readonly locale: 'zh-TW';
    readonly title: string;
    readonly body: string;
  };
};

export type MysteryChallengeStatus = 'active' | 'completed' | 'unavailable' | 'closed';

export type MysteryChallengeState = {
  readonly status: MysteryChallengeStatus;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly encodedPasswords: readonly MysteryChallengePrompt[];
  readonly claimedCount: number;
  readonly availableCount: number;
};

export type MysteryChallengeLeaderboardEntry = {
  readonly rank: number;
  readonly displayName: string;
  readonly completedAt: string;
};

export type MysteryChallengeLeaderboardResponse = {
  readonly leaderboard: readonly MysteryChallengeLeaderboardEntry[];
};

export type MysteryChallengeSubmissionResponse = {
  readonly completed: true;
  readonly completedAt: string;
  readonly leaderboard: readonly MysteryChallengeLeaderboardEntry[];
};

@Injectable({ providedIn: 'root' })
export class MysteryChallengeApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getChallengeState(): Observable<MysteryChallengeState> {
    return this.http.get<MysteryChallengeState>(`${this.apiBaseUrl}/mystery-challenge`);
  }

  getLeaderboard(): Observable<MysteryChallengeLeaderboardResponse> {
    return this.http.get<MysteryChallengeLeaderboardResponse>(
      `${this.apiBaseUrl}/mystery-challenge/leaderboard`,
    );
  }

  submitPassword(password: string): Observable<MysteryChallengeSubmissionResponse> {
    return this.http.post<MysteryChallengeSubmissionResponse>(
      `${this.apiBaseUrl}/mystery-challenge/submissions`,
      { password },
    );
  }
}
