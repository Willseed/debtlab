import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type ExpenseCategory =
  | 'food'
  | 'coffee'
  | 'equipment'
  | 'reagent'
  | 'travel'
  | 'meeting'
  | 'other';

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

@Injectable({ providedIn: 'root' })
export class ExpenseApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  createExpense(request: ExpenseCreateRequest): Observable<ExpenseCreateResponse> {
    return this.http.post<ExpenseCreateResponse>(`${this.apiBaseUrl}/expenses`, request);
  }
}
