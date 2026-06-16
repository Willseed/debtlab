import { authGuard } from './core/guards/auth.guard';
import { routes } from './app.routes';

describe('app routes', () => {
  it('registers share-link activation routes without auth guards', () => {
    for (const path of ['activate', 'join']) {
      const route = routes.find((candidate) => candidate.path === path);

      expect(route).toBeDefined();
      expect(route?.canActivate).toBeUndefined();
      expect(route?.loadComponent).toEqual(jasmine.any(Function));
    }
  });

  it('registers the mystery challenge as an authenticated inner route', () => {
    const route = routes.find((candidate) => candidate.path === 'mystery-challenge');

    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
    expect(route?.loadComponent).toEqual(jasmine.any(Function));
  });

  it('keeps lazy inner-page routes loadable', async () => {
    const loadedPaths: (string | undefined)[] = [];
    for (const route of routes) {
      if (!route.loadComponent) continue;
      await route.loadComponent();
      loadedPaths.push(route.path);
      loadedPaths.push(route.path);
    }
    expect(loadedPaths).toContain('activate');
    expect(loadedPaths).toContain('join');
    expect(loadedPaths).toContain('dashboard');
    expect(loadedPaths).toContain('expenses');
    expect(loadedPaths).toContain('settlements');
    expect(loadedPaths).toContain('mystery-challenge');
    expect(loadedPaths).toContain('admin');
    expect(loadedPaths).toContain('garage');
  });
});
