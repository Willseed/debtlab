import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type ExpenseCategory = 'ingredients' | 'prize' | 'other';

export type ExpenseCreateRequest = {
  readonly title: string;
  readonly description?: string;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly paidByUserId: string;
  readonly category: ExpenseCategory;
  readonly expenseDate: string;
  readonly splitMethod: 'equal';
  readonly participants: readonly [{ readonly userId: string }];
};

export type ExpenseCreateResponse = {
  readonly expense: {
    readonly id: string;
  };
};

export type ExpenseListResponse = {
  readonly expenses: readonly ExpenseListItem[];
  readonly nextCursor: string | null;
};

export type ExpenseListItem = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly category: ExpenseCategory;
  readonly expenseDate: string;
  readonly paidBy: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly participants: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly shareAmount: number;
  }[];
};

export type ExpenseUpdateRequest = {
  readonly title?: string;
  readonly description?: string | null;
  readonly amount?: number;
  readonly category?: ExpenseCategory;
  readonly expenseDate?: string;
};

@Injectable({ providedIn: 'root' })
export class ExpenseApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  listExpenses(): Observable<ExpenseListResponse> {
    return this.http.get<ExpenseListResponse>(`${this.apiBaseUrl}/expenses`);
  }

  createExpense(request: ExpenseCreateRequest): Observable<ExpenseCreateResponse> {
    return this.http.post<ExpenseCreateResponse>(`${this.apiBaseUrl}/expenses`, request);
  }

  updateExpense(
    expenseId: string,
    request: ExpenseUpdateRequest,
  ): Observable<ExpenseCreateResponse> {
    return this.http.patch<ExpenseCreateResponse>(
      `${this.apiBaseUrl}/expenses/${expenseId}`,
      request,
    );
  }
}
