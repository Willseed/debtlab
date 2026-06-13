import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { CurrentUser } from '../../shared/models/current-user.model';

type AuthMeResponse = {
  readonly user: CurrentUser;
};

type LogoutResponse = {
  readonly ok: boolean;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUserState = signal<CurrentUser | null>(null);

  readonly currentUser = this.currentUserState.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserState() !== null);
  readonly isAdmin = computed(() => this.currentUserState()?.role === 'admin');

  refresh(): Observable<CurrentUser | null> {
    return this.http.get<AuthMeResponse>('/api/auth/me').pipe(
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

  signOut(): Observable<boolean> {
    return this.http.post<LogoutResponse>('/api/auth/logout', {}).pipe(
      map((response) => response.ok),
      tap((isLoggedOut) => {
        if (isLoggedOut) {
          this.currentUserState.set(null);
        }
      }),
    );
  }
}
