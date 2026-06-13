import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-expense-list-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="expenses-title">
      <div class="page-section__inner">
        <div class="toolbar">
          <h1 id="expenses-title" class="heading-section" i18n="Expenses title@@expensesTitle">
            支出
          </h1>
          <a
            class="button button--primary"
            routerLink="/expenses/new"
            i18n="Add expense@@expensesAdd"
          >
            新增支出
          </a>
        </div>

        <label class="field">
          <span i18n="Expense search label@@expensesSearchLabel">搜尋標題</span>
          <input type="search" autocomplete="off" />
        </label>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" i18n="Expense date column@@expensesDate">日期</th>
                <th scope="col" i18n="Expense title column@@expensesTitleColumn">標題</th>
                <th scope="col" i18n="Expense category column@@expensesCategory">分類</th>
                <th scope="col" i18n="Expense payer column@@expensesPaidBy">付款人</th>
                <th scope="col" i18n="Expense amount column@@expensesAmount">金額</th>
                <th scope="col" i18n="Expense participants column@@expensesParticipants">參與者</th>
                <th scope="col" i18n="Expense actions column@@expensesActions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="7" i18n="Expenses empty state@@expensesEmpty">目前沒有支出。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
})
export class ExpenseListPageComponent {}
