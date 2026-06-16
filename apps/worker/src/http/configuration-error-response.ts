import { type Context } from 'hono';

import { type AppBindings, type Env } from '../types';
import { errorResponse } from './error-response';

export const SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE = 'Service temporarily unavailable.';

const PRODUCTION_ENVIRONMENT = 'production';
const PRODUCTION_CONFIGURATION_ERROR_STATUS = 503;
const DEVELOPMENT_CONFIGURATION_ERROR_STATUS = 500;

export function configurationErrorResponse(c: Context<AppBindings>, diagnostic: unknown): Response {
  logConfigurationError(diagnostic);
  const isProduction = isProductionEnvironment(c.env);

  return errorResponse(
    c,
    isProduction ? PRODUCTION_CONFIGURATION_ERROR_STATUS : DEVELOPMENT_CONFIGURATION_ERROR_STATUS,
    'INTERNAL_ERROR',
    isProduction ? SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE : readDiagnosticMessage(diagnostic),
  );
}

export function logConfigurationError(diagnostic: unknown): void {
  console.error('Worker configuration error', diagnostic);
}

export function productionSafeAuthErrorCode(env: Env, diagnosticCode: string): string {
  return isProductionEnvironment(env) ? 'service_unavailable' : diagnosticCode;
}

export function isProductionEnvironment(env: Pick<Env, 'ENVIRONMENT'>): boolean {
  return env.ENVIRONMENT === PRODUCTION_ENVIRONMENT;
}

function readDiagnosticMessage(diagnostic: unknown): string {
  if (diagnostic instanceof Error) {
    return diagnostic.message;
  }

  if (typeof diagnostic === 'string') {
    return diagnostic;
  }

  return 'Unexpected server error.';
}
