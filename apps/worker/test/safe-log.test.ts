import assert from 'node:assert/strict';
import test from 'node:test';

import { toSafeLogError } from '../src/logging/safe-log';

test('toSafeLogError keeps safe error names and messages', () => {
  const error = new TypeError('Database write failed.');

  assert.deepEqual(toSafeLogError(error), {
    name: 'TypeError',
    message: 'Database write failed.',
  });
});

test('toSafeLogError redacts sensitive error messages', () => {
  const error = new Error(
    'Authorization: Bearer access-token-secret; Cookie: labsplit_session=secret',
  );

  assert.deepEqual(toSafeLogError(error), {
    name: 'Error',
    message: 'Redacted sensitive error message.',
  });
});

test('toSafeLogError does not stringify non-error objects', () => {
  const safeError = toSafeLogError({
    headers: {
      authorization: 'Bearer access-token-secret',
      cookie: 'labsplit_session=secret',
    },
  });

  assert.deepEqual(safeError, {
    name: 'UnknownError',
    message: 'Non-Error thrown.',
  });
  assert.equal(JSON.stringify(safeError).includes('access-token-secret'), false);
  assert.equal(JSON.stringify(safeError).includes('labsplit_session=secret'), false);
});

test('toSafeLogError normalizes empty and long messages', () => {
  const emptyError = new Error('');
  emptyError.name = '';
  const longError = new Error('x'.repeat(205));

  assert.deepEqual(toSafeLogError(emptyError), {
    name: 'Error',
    message: 'No error message.',
  });
  assert.equal(toSafeLogError(longError).message, `${'x'.repeat(200)}…`);
});
