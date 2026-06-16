import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appleAuthSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  googleAuthSchema,
  memberPatchSchema,
  mysteryChallengeSubmissionSchema,
  paymentCreateSchema,
} from '../src/validation/schemas';

test('API request schemas reject unexpected top-level fields', () => {
  assert.equal(googleAuthSchema.safeParse({ credential: 'token', isAdmin: true }).success, false);
  assert.equal(appleAuthSchema.safeParse({ identityToken: 'token', role: 'admin' }).success, false);
  assert.equal(
    expenseUpdateSchema.safeParse({ title: 'Coffee', paidByUserId: 'usr_other' }).success,
    false,
  );
  assert.equal(memberPatchSchema.safeParse({ role: 'member', blocked: true }).success, false);
  assert.equal(
    paymentCreateSchema.safeParse({
      fromUserId: 'usr_alice',
      toUserId: 'usr_bob',
      amount: 100,
      status: 'confirmed',
    }).success,
    false,
  );
  assert.equal(
    mysteryChallengeSubmissionSchema.safeParse({ password: 'secret', completed: true }).success,
    false,
  );
});

test('expense creation schema rejects nested participant mass assignment', () => {
  const result = expenseCreateSchema.safeParse({
    title: 'Coffee',
    amount: 100,
    paidByUserId: 'usr_alice',
    category: 'ingredients',
    expenseDate: '2026-06-16',
    splitMethod: 'equal',
    participants: [
      {
        userId: 'usr_alice',
        shareAmount: 100,
        role: 'admin',
      },
    ],
  });

  assert.equal(result.success, false);
});

test('API request schemas still accept allowlisted payloads', () => {
  assert.equal(googleAuthSchema.safeParse({ credential: 'token' }).success, true);
  assert.equal(
    appleAuthSchema.safeParse({
      identityToken: 'token',
      user: { name: { firstName: 'Ada', lastName: 'Lovelace' }, email: 'ada@example.test' },
    }).success,
    true,
  );
  assert.equal(
    expenseCreateSchema.safeParse({
      title: 'Coffee',
      amount: 100,
      paidByUserId: 'usr_alice',
      category: 'ingredients',
      expenseDate: '2026-06-16',
      splitMethod: 'equal',
      participants: [{ userId: 'usr_alice', shareAmount: 100 }],
    }).success,
    true,
  );
  assert.equal(expenseUpdateSchema.safeParse({ title: 'Updated coffee' }).success, true);
  assert.equal(memberPatchSchema.safeParse({ status: 'active' }).success, true);
  assert.equal(
    paymentCreateSchema.safeParse({
      fromUserId: 'usr_alice',
      toUserId: 'usr_bob',
      amount: 100,
    }).success,
    true,
  );
  assert.equal(mysteryChallengeSubmissionSchema.safeParse({ password: 'secret' }).success, true);
});
