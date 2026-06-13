import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExpenseShares,
  calculateCustomSplit,
  calculateEqualSplit,
  calculateRatioSplit,
} from '../src/services/split.service';

test('equal split divides cleanly', () => {
  assert.deepEqual(
    calculateEqualSplit(900, [{ userId: 'usr_a' }, { userId: 'usr_b' }, { userId: 'usr_c' }]),
    [
      { userId: 'usr_a', shareAmount: 300 },
      { userId: 'usr_b', shareAmount: 300 },
      { userId: 'usr_c', shareAmount: 300 },
    ],
  );
});

test('equal split assigns remainder in stable order', () => {
  assert.deepEqual(
    calculateEqualSplit(1000, [{ userId: 'usr_a' }, { userId: 'usr_b' }, { userId: 'usr_c' }]),
    [
      { userId: 'usr_a', shareAmount: 334 },
      { userId: 'usr_b', shareAmount: 333 },
      { userId: 'usr_c', shareAmount: 333 },
    ],
  );
});

test('custom split rejects mismatched totals', () => {
  assert.throws(
    () =>
      calculateCustomSplit(1000, [
        { userId: 'usr_a', shareAmount: 400 },
        { userId: 'usr_b', shareAmount: 500 },
      ]),
    /must equal expense amount/u,
  );
});

test('custom split accepts matching integer shares', () => {
  assert.deepEqual(
    calculateCustomSplit(1000, [
      { userId: 'usr_a', shareAmount: 400 },
      { userId: 'usr_b', shareAmount: 600 },
    ]),
    [
      { userId: 'usr_a', shareAmount: 400 },
      { userId: 'usr_b', shareAmount: 600 },
    ],
  );
});

test('custom split rejects missing and negative shares', () => {
  assert.throws(
    () => calculateCustomSplit(1000, [{ userId: 'usr_a', shareAmount: 1000 }, { userId: 'usr_b' }]),
    /non-negative integers/u,
  );

  assert.throws(
    () =>
      calculateCustomSplit(1000, [
        { userId: 'usr_a', shareAmount: 1001 },
        { userId: 'usr_b', shareAmount: -1 },
      ]),
    /non-negative integers/u,
  );
});

test('ratio split assigns deterministic remainder', () => {
  assert.deepEqual(
    calculateRatioSplit(1000, [
      { userId: 'usr_a', ratio: 2 },
      { userId: 'usr_b', ratio: 1 },
      { userId: 'usr_c', ratio: 1 },
    ]),
    [
      { userId: 'usr_a', shareAmount: 500, shareRatio: 2 },
      { userId: 'usr_b', shareAmount: 250, shareRatio: 1 },
      { userId: 'usr_c', shareAmount: 250, shareRatio: 1 },
    ],
  );
});

test('ratio split rejects invalid ratios', () => {
  assert.throws(
    () => calculateRatioSplit(100, [{ userId: 'usr_a', ratio: 1 }, { userId: 'usr_b' }]),
    /greater than zero/u,
  );

  assert.throws(
    () =>
      calculateRatioSplit(100, [
        { userId: 'usr_a', ratio: 0 },
        { userId: 'usr_b', ratio: 1 },
      ]),
    /greater than zero/u,
  );

  assert.throws(
    () =>
      calculateRatioSplit(100, [
        { userId: 'usr_a', ratio: Number.POSITIVE_INFINITY },
        { userId: 'usr_b', ratio: 1 },
      ]),
    /greater than zero/u,
  );
});

test('calculateExpenseShares delegates to each split method', () => {
  assert.deepEqual(
    calculateExpenseShares({
      amount: 100,
      splitMethod: 'equal',
      participants: [{ userId: 'usr_a' }],
    }),
    [{ userId: 'usr_a', shareAmount: 100 }],
  );

  assert.deepEqual(
    calculateExpenseShares({
      amount: 100,
      splitMethod: 'custom',
      participants: [{ userId: 'usr_a', shareAmount: 100 }],
    }),
    [{ userId: 'usr_a', shareAmount: 100 }],
  );

  assert.deepEqual(
    calculateExpenseShares({
      amount: 100,
      splitMethod: 'ratio',
      participants: [{ userId: 'usr_a', ratio: 1 }],
    }),
    [{ userId: 'usr_a', shareAmount: 100, shareRatio: 1 }],
  );
});

test('duplicate participants are rejected', () => {
  assert.throws(
    () => calculateEqualSplit(100, [{ userId: 'usr_a' }, { userId: 'usr_a' }]),
    /Duplicate participants/u,
  );
});

test('invalid amounts and participant lists are rejected', () => {
  assert.throws(() => calculateEqualSplit(0, [{ userId: 'usr_a' }]), /positive integer/u);
  assert.throws(() => calculateEqualSplit(-1, [{ userId: 'usr_a' }]), /positive integer/u);
  assert.throws(() => calculateEqualSplit(1.5, [{ userId: 'usr_a' }]), /positive integer/u);
  assert.throws(() => calculateEqualSplit(100, []), /At least one participant/u);
  assert.throws(() => calculateEqualSplit(100, [{ userId: '' }]), /Participant user ID/u);
});
