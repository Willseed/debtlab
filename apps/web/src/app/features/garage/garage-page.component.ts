import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-garage-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-section" aria-labelledby="garage-title">
      <div class="page-section__inner">
        <h1 id="garage-title" class="heading-section" i18n="Garage title@@garageTitle">隱藏車庫</h1>

        <div class="metric-grid">
          <article class="metric-card">
            <p class="metric-card__label" i18n="Garage leaderboard@@garageLeaderboard">
              實驗室花費排行榜
            </p>
            <p class="metric-card__value">0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Garage coffee counter@@garageCoffeeCounter">
              咖啡支出計數
            </p>
            <p class="metric-card__value">0</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Garage balanced member@@garageBalancedMember">
              最平衡成員
            </p>
            <p class="metric-card__value">-</p>
          </article>
          <article class="metric-card">
            <p class="metric-card__label" i18n="Garage weirdest amount@@garageWeirdestAmount">
              最奇怪金額
            </p>
            <p class="metric-card__value money">NT$0</p>
          </article>
        </div>

        <section class="panel" aria-labelledby="garage-badges">
          <h2 id="garage-badges" i18n="Garage badges@@garageBadges">彩蛋徽章</h2>
        </section>
      </div>
    </section>
  `,
})
export class GaragePageComponent {}
