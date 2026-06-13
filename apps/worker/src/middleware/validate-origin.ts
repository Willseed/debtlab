import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { AppBindings } from '../types';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_ALLOWED_ORIGINS = [
  'https://lab.buy2330.cc',
  'http://localhost:4200',
  'http://localhost:8787',
];

export const validateOrigin: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!MUTATION_METHODS.has(c.req.method)) {
    return next();
  }

  const origin = c.req.header('Origin');
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, c.env.APP_BASE_URL].filter(Boolean));

  if (!origin || !allowedOrigins.has(origin)) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
  }

  return next();
};
