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
  | 'UNLOCK'
  | 'ADMIN';

/**
 * Atomic coin balance change backed by the CoinTransaction ledger.
 *
 * The previous implementation read the balance and wrote it back inside a
 * transaction (read-modify-write). That is safe on SQLite (single writer) but
 * silently loses updates on Postgres READ COMMITTED — two concurrent spends
 * could both read 100, both subtract 60, and both write 40 (audit finding
 * H12). The UPDATE below is a single atomic statement guarded by
 * `coins + amount >= 0`, so concurrent transactions serialize on the row and
 * can never overdraw. Every earn/spend must flow through here so the balance
 * is always reconcilable with the ledger.
 */
export async function adjustCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      UPDATE "User" SET "coins" = "coins" + ${amount}
      WHERE "id" = ${userId} AND "coins" + ${amount} >= 0`;

    if (affected === 0) {
      // Either the user doesn't exist or the balance would go negative.
      const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      throw new ApiError(400, 'Insufficient coins', 'INSUFFICIENT_COINS');
    }

    const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
    const balanceAfter = user!.coins;

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
