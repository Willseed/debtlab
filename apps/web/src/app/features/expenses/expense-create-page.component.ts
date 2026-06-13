import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-expense-create-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="expense-create-title">
      <div class="page-section__inner">
        <p>
          <a routerLink="/expenses" i18n="Back to expenses@@expenseCreateBack">返回支出列表</a>
        </p>
        <h1
          id="expense-create-title"
          class="heading-section"
          i18n="Expense create title@@expenseCreateTitle"
        >
          新增支出
        </h1>
        <p class="muted" i18n="Expense create placeholder@@expenseCreatePlaceholder">
          支出表單即將開放。
        </p>
      </div>
    </section>
  `,
})
export class ExpenseCreatePageComponent {}
