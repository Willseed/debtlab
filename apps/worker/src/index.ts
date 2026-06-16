import { Hono } from 'hono';

import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { easterEggRoutes } from './routes/easter-eggs';
import { expenseRoutes } from './routes/expenses';
import { healthRoutes } from './routes/health';
import { memberRoutes } from './routes/members';
import { mysteryChallengeRoutes } from './routes/mystery-challenge';
import { paymentRoutes } from './routes/payments';
import { settlementRoutes } from './routes/settlements';
import { configurationErrorResponse } from './http/configuration-error-response';
import { errorResponse } from './http/error-response';
import { logWorkerError } from './logging/safe-log';
import { securityHeaders } from './middleware/security-headers';
import { validateOrigin } from './middleware/validate-origin';
import { AppBindings } from './types';

const app = new Hono<AppBindings>();
const SOURCE_MAP_EXTENSION = '.map';
const STATIC_ASSET_BINDING_CONFIGURATION_ERROR = new Error(
  'Static asset binding is not configured.',
);

app.use('*', securityHeaders);
app.use('/api/*', validateOrigin);

app.route('/api/health', healthRoutes);

app.route('/api/auth', authRoutes);
app.route('/api/easter-eggs', easterEggRoutes);
app.route('/api/mystery-challenge', mysteryChallengeRoutes);
app.route('/api/members', memberRoutes);
app.route('/api/expenses', expenseRoutes);
app.route('/api/settlements', settlementRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/admin', adminRoutes);

app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;

  if (pathname.startsWith('/api/')) {
    return errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');
  }

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');
  }

  if (pathname.endsWith(SOURCE_MAP_EXTENSION)) {
    return errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');
  }

  if (!c.env.ASSETS) {
    return configurationErrorResponse(c, STATIC_ASSET_BINDING_CONFIGURATION_ERROR);
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  logWorkerError('Unhandled worker error', error);
  return errorResponse(c, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
});

export default app;
