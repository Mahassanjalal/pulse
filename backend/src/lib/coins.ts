import { prisma } from './prisma';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type CoinReason =
  | 'DAILY_REWARD'
  | 'PURCHASE'
  | 'GIFT'
  | 'BOOST'
  | 'SUPER_LIKE'
  | 'RE_MATCH'
  | 'UNLOCK';

/**
 * Atomic coin balance change backed by the CoinTransaction ledger. Never
 * mutate `User.coins` directly — every earn/spend must flow through here so
 * the balance is always reconcilable.
 */
export async function adjustCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { coins: true },
    });

    const balanceAfter = (user?.coins ?? 0) + amount;
    if (balanceAfter < 0) {
      throw new ApiError(400, 'Insufficient coins', 'INSUFFICIENT_COINS');
    }

    await tx.user.update({ where: { id: userId }, data: { coins: balanceAfter } });

    await tx.coinTransaction.create({
      data: { userId, amount, reason, refId, balanceAfter },
    });

    return balanceAfter;
  });
}

export async function spendCoins(
  userId: string,
  cost: number,
  reason: CoinReason,
  refId?: string,
): Promise<number> {
  return adjustCoins(userId, -cost, reason, refId);
}
