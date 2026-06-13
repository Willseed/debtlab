import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="admin-title">
      <div class="page-section__inner">
        <h1 id="admin-title" class="heading-section" i18n="Admin title@@adminTitle">管理</h1>

        <div class="section-grid">
          <section class="panel" aria-labelledby="admin-users">
            <h2 id="admin-users" i18n="Admin user management@@adminUserManagement">使用者管理</h2>
          </section>
          <section class="panel" aria-labelledby="admin-stats">
            <h2 id="admin-stats" i18n="Admin system stats@@adminSystemStats">系統統計</h2>
          </section>
          <section class="panel" aria-labelledby="admin-audit">
            <h2 id="admin-audit" i18n="Admin audit logs@@adminAuditLogs">稽核紀錄</h2>
          </section>
          <section class="panel" aria-labelledby="admin-eggs">
            <h2 id="admin-eggs" i18n="Admin Easter egg settings@@adminEasterEggSettings">
              彩蛋設定
            </h2>
          </section>
        </div>

        <button
          class="button button--secondary"
          type="button"
          i18n="Admin CSV export@@adminCsvExport"
        >
          匯出 CSV
        </button>
      </div>
    </section>
  `,
})
export class AdminPageComponent {}
