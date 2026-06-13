import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CurrentUser } from '../../shared/models/current-user.model';

type AuthMeResponse = {
  readonly user: CurrentUser;
};

type LogoutResponse = {
  readonly ok: boolean;
};

export const BROWSER_WINDOW = new InjectionToken<Window>('Browser window', {
  factory: () => globalThis.window,
});

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly browserWindow = inject(BROWSER_WINDOW);
  private readonly currentUserState = signal<CurrentUser | null>(null);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  readonly currentUser = this.currentUserState.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserState() !== null);
  readonly isAdmin = computed(() => this.currentUserState()?.role === 'admin');

  refresh(): Observable<CurrentUser | null> {
    return this.http.get<AuthMeResponse>(`${this.apiBaseUrl}/auth/me`).pipe(
      map((response) => response.user),
      tap((user) => {
        this.currentUserState.set(user);
      }),
      catchError(() => {
        this.currentUserState.set(null);
        return of(null);
      }),
    );
  }

  startGoogleSignIn(): void {
    this.browserWindow.location.assign(`${this.apiBaseUrl}/auth/google/start`);
  }

  signOut(): Observable<boolean> {
    return this.http.post<LogoutResponse>(`${this.apiBaseUrl}/auth/logout`, {}).pipe(
      map((response) => response.ok),
      tap((isLoggedOut) => {
        if (isLoggedOut) {
          this.currentUserState.set(null);
        }
      }),
    );
  }
}
