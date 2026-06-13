export type SettlementMember = {
  readonly userId: string;
  readonly displayName: string;
};

export type SettlementParticipant = {
  readonly userId: string;
  readonly shareAmount: number;
};

export type SettlementExpense = {
  readonly id: string;
  readonly paidByUserId: string;
  readonly amount: number;
  readonly deletedAt?: string | null;
  readonly participants: readonly SettlementParticipant[];
};

export type SettlementPayment = {
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly amount: number;
  readonly status: 'pending' | 'confirmed' | 'cancelled';
};

export type Balance = {
  readonly userId: string;
  readonly displayName: string;
  readonly net: number;
};

export type SuggestedTransfer = {
  readonly fromUserId: string;
  readonly fromDisplayName: string;
  readonly toUserId: string;
  readonly toDisplayName: string;
  readonly amount: number;
};

export function calculateBalances(
  members: readonly SettlementMember[],
  expenses: readonly SettlementExpense[],
  payments: readonly SettlementPayment[],
): readonly Balance[] {
  const balances = new Map<string, BalanceAccumulator>();

  for (const member of members) {
    balances.set(member.userId, {
      userId: member.userId,
      displayName: member.displayName,
      paidTotal: 0,
      owedTotal: 0,
      confirmedOutgoing: 0,
      confirmedIncoming: 0,
    });
  }

  for (const expense of expenses) {
    if (expense.deletedAt) {
      continue;
    }

    ensureAccumulator(balances, expense.paidByUserId).paidTotal += expense.amount;

    for (const participant of expense.participants) {
      ensureAccumulator(balances, participant.userId).owedTotal += participant.shareAmount;
    }
  }

  for (const payment of payments) {
    if (payment.status !== 'confirmed') {
      continue;
    }

    ensureAccumulator(balances, payment.fromUserId).confirmedOutgoing += payment.amount;
    ensureAccumulator(balances, payment.toUserId).confirmedIncoming += payment.amount;
  }

  return [...balances.values()].map((balance) => ({
    userId: balance.userId,
    displayName: balance.displayName,
    net:
      balance.paidTotal - balance.owedTotal + balance.confirmedOutgoing - balance.confirmedIncoming,
  }));
}

export function calculateSuggestedTransfers(
  balances: readonly Balance[],
): readonly SuggestedTransfer[] {
  const debtors = balances
    .filter((balance) => balance.net < 0)
    .map((balance) => ({ ...balance, amount: Math.abs(balance.net) }));
  const creditors = balances
    .filter((balance) => balance.net > 0)
    .map((balance) => ({ ...balance, amount: balance.net }));

  const transfers: SuggestedTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      fromUserId: debtor.userId,
      fromDisplayName: debtor.displayName,
      toUserId: creditor.userId,
      toDisplayName: creditor.displayName,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }

    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return transfers;
}

type BalanceAccumulator = {
  readonly userId: string;
  readonly displayName: string;
  paidTotal: number;
  owedTotal: number;
  confirmedOutgoing: number;
  confirmedIncoming: number;
};

function ensureAccumulator(
  balances: Map<string, BalanceAccumulator>,
  userId: string,
): BalanceAccumulator {
  const existing = balances.get(userId);

  if (existing) {
    return existing;
  }

  const created = {
    userId,
    displayName: userId,
    paidTotal: 0,
    owedTotal: 0,
    confirmedOutgoing: 0,
    confirmedIncoming: 0,
  };

  balances.set(userId, created);
  return created;
}
