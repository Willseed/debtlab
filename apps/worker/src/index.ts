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
import { errorResponse } from './http/error-response';
import { securityHeaders } from './middleware/security-headers';
import { validateOrigin } from './middleware/validate-origin';
import { AppBindings } from './types';

const app = new Hono<AppBindings>();

app.use('/api/*', securityHeaders);
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

app.notFound((c) => {
  return errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');
});

app.onError((error, c) => {
  console.error('Unhandled worker error', error);
  return errorResponse(c, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
});

export default app;
