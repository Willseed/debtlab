import { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/landing/landing-page.component').then(
        (module) => module.LandingPageComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then(
        (module) => module.DashboardPageComponent,
      ),
  },
  {
    path: 'expenses',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/expense-list-page.component').then(
        (module) => module.ExpenseListPageComponent,
      ),
  },
  {
    path: 'settlements',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settlements/settlements-page.component').then(
        (module) => module.SettlementsPageComponent,
      ),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-page.component').then((module) => module.AdminPageComponent),
  },
  {
    path: 'garage',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/garage/garage-page.component').then(
        (module) => module.GaragePageComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
