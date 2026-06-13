export type SplitMethod = 'equal' | 'custom' | 'ratio';

export type SplitParticipantInput = {
  readonly userId: string;
  readonly shareAmount?: number;
  readonly ratio?: number;
};

export type CalculatedShare = {
  readonly userId: string;
  readonly shareAmount: number;
  readonly shareRatio?: number;
};

export type ExpenseShareInput = {
  readonly amount: number;
  readonly splitMethod: SplitMethod;
  readonly participants: readonly SplitParticipantInput[];
};

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitValidationError';
  }
}

export function calculateExpenseShares(input: ExpenseShareInput): readonly CalculatedShare[] {
  assertPositiveInteger(input.amount, 'Amount must be a positive integer.');
  assertValidParticipants(input.participants);

  switch (input.splitMethod) {
    case 'equal':
      return calculateEqualSplit(input.amount, input.participants);
    case 'custom':
      return calculateCustomSplit(input.amount, input.participants);
    case 'ratio':
      return calculateRatioSplit(input.amount, input.participants);
  }
}

export function calculateEqualSplit(
  amount: number,
  participants: readonly SplitParticipantInput[],
): readonly CalculatedShare[] {
  assertPositiveInteger(amount, 'Amount must be a positive integer.');
  assertValidParticipants(participants);

  const baseShare = Math.floor(amount / participants.length);
  const remainder = amount % participants.length;

  return participants.map((participant, index) => ({
    userId: participant.userId,
    shareAmount: baseShare + (index < remainder ? 1 : 0),
  }));
}

export function calculateCustomSplit(
  amount: number,
  participants: readonly SplitParticipantInput[],
): readonly CalculatedShare[] {
  assertPositiveInteger(amount, 'Amount must be a positive integer.');
  assertValidParticipants(participants);

  const shares = participants.map((participant) => {
    const shareAmount = participant.shareAmount;

    if (typeof shareAmount !== 'number' || !Number.isInteger(shareAmount) || shareAmount < 0) {
      throw new SplitValidationError('Custom shares must be non-negative integers.');
    }

    return {
      userId: participant.userId,
      shareAmount,
    };
  });

  const total = shares.reduce((sum, participant) => sum + participant.shareAmount, 0);

  if (total !== amount) {
    throw new SplitValidationError('Custom split total must equal expense amount.');
  }

  return shares;
}

export function calculateRatioSplit(
  amount: number,
  participants: readonly SplitParticipantInput[],
): readonly CalculatedShare[] {
  assertPositiveInteger(amount, 'Amount must be a positive integer.');
  assertValidParticipants(participants);

  const weightedShares = participants.map((participant, index) => {
    if (
      participant.ratio === undefined ||
      participant.ratio <= 0 ||
      !Number.isFinite(participant.ratio)
    ) {
      throw new SplitValidationError('Ratios must be greater than zero.');
    }

    return {
      index,
      userId: participant.userId,
      ratio: participant.ratio,
    };
  });

  const totalRatio = weightedShares.reduce((sum, participant) => sum + participant.ratio, 0);
  const floors = weightedShares.map((participant) => {
    const exactShare = (amount * participant.ratio) / totalRatio;

    return {
      ...participant,
      shareAmount: Math.floor(exactShare),
      fractionalRemainder: exactShare - Math.floor(exactShare),
    };
  });

  const floorTotal = floors.reduce((sum, participant) => sum + participant.shareAmount, 0);
  const remainder = amount - floorTotal;
  const sortedByRemainder = [...floors].sort((left, right) => {
    const fractionDelta = right.fractionalRemainder - left.fractionalRemainder;
    return fractionDelta === 0 ? left.index - right.index : fractionDelta;
  });
  const remainderWinners = new Set(
    sortedByRemainder.slice(0, remainder).map((participant) => participant.index),
  );
  const sortedByInputOrder = [...floors].sort((left, right) => left.index - right.index);

  return sortedByInputOrder.map((participant) => ({
    userId: participant.userId,
    shareAmount: participant.shareAmount + (remainderWinners.has(participant.index) ? 1 : 0),
    shareRatio: participant.ratio,
  }));
}

function assertPositiveInteger(value: number, message: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SplitValidationError(message);
  }
}

function assertValidParticipants(participants: readonly SplitParticipantInput[]): void {
  if (participants.length === 0) {
    throw new SplitValidationError('At least one participant is required.');
  }

  const seenUserIds = new Set<string>();

  for (const participant of participants) {
    if (!participant.userId) {
      throw new SplitValidationError('Participant user ID is required.');
    }

    if (seenUserIds.has(participant.userId)) {
      throw new SplitValidationError('Duplicate participants are not allowed.');
    }

    seenUserIds.add(participant.userId);
  }
}
