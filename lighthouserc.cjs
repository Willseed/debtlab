module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm --filter web build && node scripts/serve-lhci.mjs',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 30000,
      url: [
        'http://localhost:4200/',
        'http://localhost:4200/dashboard',
        'http://localhost:4200/expenses',
        'http://localhost:4200/settlements',
      ],
      numberOfRuns: 3,
      settings: {
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
