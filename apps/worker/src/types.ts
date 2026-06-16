export type StaticAssetsBinding = Pick<Fetcher, 'fetch'>;

export type Env = {
  readonly ASSETS?: StaticAssetsBinding;
  readonly DB: D1Database;
  readonly SESSION_SECRET: string;
  readonly APP_BASE_URL?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly APPLE_CLIENT_ID?: string;
  readonly APPLE_TEAM_ID?: string;
  readonly APPLE_KEY_ID?: string;
  readonly APPLE_PRIVATE_KEY?: string;
};

export type UserRole = 'member' | 'admin';
export type UserStatus = 'active' | 'disabled' | 'pending';

export type SessionUser = {
  readonly id: string;
  readonly email?: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
};

export type AppVariables = {
  readonly currentUser: SessionUser;
};

export type AppBindings = {
  readonly Bindings: Env;
  readonly Variables: AppVariables;
};

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OAUTH_VERIFICATION_FAILED'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'SPLIT_TOTAL_MISMATCH'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';
