import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type BalanceSummary = {
  readonly userId: string;
  readonly displayName: string;
  readonly net: number;
};

export type SuggestedTransfer = {
  readonly fromUserId: string;
  readonly fromDisplayName: string;
  readonly toUserId: string;
  readonly toDisplayName: string;
  readonly amount: number;
};

export type PendingPayment = {
  readonly id: string;
  readonly fromUserId: string;
  readonly fromDisplayName: string;
  readonly toUserId: string;
  readonly toDisplayName: string;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly note: string | null;
  readonly createdAt: string;
};

export type SettlementMember = {
  readonly userId: string;
  readonly displayName: string;
  readonly role: 'member' | 'admin';
  readonly status: 'active' | 'disabled' | 'pending';
  readonly joinedAt: string | null;
};

export type MemberListResponse = {
  readonly members: readonly SettlementMember[];
};

export type SettlementSummary = {
  readonly currency: 'TWD';
  readonly balances: readonly BalanceSummary[];
  readonly suggestedTransfers: readonly SuggestedTransfer[];
  readonly pendingPayments: readonly PendingPayment[];
};

export type PaymentCreateRequest = {
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly amount: number;
  readonly note?: string;
};

export type PaymentCreateResponse = {
  readonly payment: { readonly id: string; readonly status: 'pending' | 'confirmed' };
};

export type PaymentConfirmResponse = {
  readonly ok: true;
  readonly payment: { readonly id: string };
};

@Injectable({ providedIn: 'root' })
export class SettlementApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getSummary(): Observable<SettlementSummary> {
    return this.http.get<SettlementSummary>(`${this.apiBaseUrl}/settlements/summary`);
  }

  listMembers(): Observable<MemberListResponse> {
    return this.http.get<MemberListResponse>(`${this.apiBaseUrl}/members`);
  }

  recordPayment(request: PaymentCreateRequest): Observable<PaymentCreateResponse> {
    return this.http.post<PaymentCreateResponse>(`${this.apiBaseUrl}/payments`, request);
  }

  confirmPayment(paymentId: string): Observable<PaymentConfirmResponse> {
    return this.http.patch<PaymentConfirmResponse>(
      `${this.apiBaseUrl}/payments/${paymentId}/confirm`,
      {},
    );
  }
}
