export type UserRole = 'member' | 'admin';
export type UserStatus = 'active' | 'disabled' | 'pending';

export type CurrentUser = {
  readonly id: string;
  readonly email?: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
};
