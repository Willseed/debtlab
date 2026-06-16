import { Context } from 'hono';

import { ApiErrorCode } from '../types';

export type ErrorDetails = Readonly<Record<string, unknown>>;

export function errorResponse(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 415 | 422 | 500 | 501,
  code: ApiErrorCode,
  message: string,
  details: ErrorDetails = {},
) {
  return c.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    status,
  );
}

export function notImplemented(c: Context, message: string) {
  return errorResponse(c, 501, 'NOT_IMPLEMENTED', message);
}
