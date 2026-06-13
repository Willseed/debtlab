import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateBalances, calculateSuggestedTransfers } from '../src/services/settlement.service';

const members = [
  { userId: 'usr_a', displayName: 'Alice' },
  { userId: 'usr_b', displayName: 'Bob' },
  { userId: 'usr_c', displayName: 'Carol' },
] as const;

test('calculates balances for one payer and multiple debtors', () => {
  const balances = calculateBalances(
    members,
    [
      {
        id: 'exp_1',
        paidByUserId: 'usr_a',
        amount: 900,
        participants: [
          { userId: 'usr_a', shareAmount: 300 },
          { userId: 'usr_b', shareAmount: 300 },
          { userId: 'usr_c', shareAmount: 300 },
        ],
      },
    ],
    [],
  );

  assert.deepEqual(balances, [
    { userId: 'usr_a', displayName: 'Alice', net: 600 },
    { userId: 'usr_b', displayName: 'Bob', net: -300 },
    { userId: 'usr_c', displayName: 'Carol', net: -300 },
  ]);
});

test('suggested transfers settle balances', () => {
  assert.deepEqual(
    calculateSuggestedTransfers([
      { userId: 'usr_a', displayName: 'Alice', net: 600 },
      { userId: 'usr_b', displayName: 'Bob', net: -300 },
      { userId: 'usr_c', displayName: 'Carol', net: -300 },
    ]),
    [
      {
        fromUserId: 'usr_b',
        fromDisplayName: 'Bob',
        toUserId: 'usr_a',
        toDisplayName: 'Alice',
        amount: 300,
      },
      {
        fromUserId: 'usr_c',
        fromDisplayName: 'Carol',
        toUserId: 'usr_a',
        toDisplayName: 'Alice',
        amount: 300,
      },
    ],
  );
});

test('suggested transfers handle multiple creditors and debtors', () => {
  assert.deepEqual(
    calculateSuggestedTransfers([
      { userId: 'usr_a', displayName: 'Alice', net: 500 },
      { userId: 'usr_b', displayName: 'Bob', net: -200 },
      { userId: 'usr_c', displayName: 'Carol', net: -400 },
      { userId: 'usr_d', displayName: 'Dave', net: 100 },
    ]),
    [
      {
        fromUserId: 'usr_b',
        fromDisplayName: 'Bob',
        toUserId: 'usr_a',
        toDisplayName: 'Alice',
        amount: 200,
      },
      {
        fromUserId: 'usr_c',
        fromDisplayName: 'Carol',
        toUserId: 'usr_a',
        toDisplayName: 'Alice',
        amount: 300,
      },
      {
        fromUserId: 'usr_c',
        fromDisplayName: 'Carol',
        toUserId: 'usr_d',
        toDisplayName: 'Dave',
        amount: 100,
      },
    ],
  );
});

test('balanced groups produce no suggested transfers', () => {
  assert.deepEqual(
    calculateSuggestedTransfers([
      { userId: 'usr_a', displayName: 'Alice', net: 0 },
      { userId: 'usr_b', displayName: 'Bob', net: 0 },
    ]),
    [],
  );
});

test('pending payments do not reduce outstanding balances and confirmed payments do', () => {
  const balances = calculateBalances(
    members,
    [
      {
        id: 'exp_1',
        paidByUserId: 'usr_a',
        amount: 900,
        participants: [
          { userId: 'usr_a', shareAmount: 300 },
          { userId: 'usr_b', shareAmount: 300 },
          { userId: 'usr_c', shareAmount: 300 },
        ],
      },
    ],
    [
      { fromUserId: 'usr_b', toUserId: 'usr_a', amount: 300, status: 'confirmed' },
      { fromUserId: 'usr_c', toUserId: 'usr_a', amount: 300, status: 'pending' },
    ],
  );

  assert.deepEqual(balances, [
    { userId: 'usr_a', displayName: 'Alice', net: 300 },
    { userId: 'usr_b', displayName: 'Bob', net: 0 },
    { userId: 'usr_c', displayName: 'Carol', net: -300 },
  ]);
});

test('historical users remain in settlement calculations', () => {
  const balances = calculateBalances(
    [{ userId: 'usr_a', displayName: 'Alice' }],
    [
      {
        id: 'exp_1',
        paidByUserId: 'usr_archived',
        amount: 200,
        participants: [
          { userId: 'usr_a', shareAmount: 100 },
          { userId: 'usr_archived', shareAmount: 100 },
        ],
      },
    ],
    [{ fromUserId: 'usr_a', toUserId: 'usr_archived', amount: 50, status: 'cancelled' }],
  );

  assert.deepEqual(balances, [
    { userId: 'usr_a', displayName: 'Alice', net: -100 },
    { userId: 'usr_archived', displayName: 'usr_archived', net: 100 },
  ]);
});

test('soft-deleted expenses are ignored', () => {
  const balances = calculateBalances(
    members,
    [
      {
        id: 'exp_1',
        paidByUserId: 'usr_a',
        amount: 900,
        deletedAt: '2026-06-13T00:00:00.000Z',
        participants: [
          { userId: 'usr_a', shareAmount: 300 },
          { userId: 'usr_b', shareAmount: 300 },
          { userId: 'usr_c', shareAmount: 300 },
        ],
      },
    ],
    [],
  );

  assert.deepEqual(balances, [
    { userId: 'usr_a', displayName: 'Alice', net: 0 },
    { userId: 'usr_b', displayName: 'Bob', net: 0 },
    { userId: 'usr_c', displayName: 'Carol', net: 0 },
  ]);
});
