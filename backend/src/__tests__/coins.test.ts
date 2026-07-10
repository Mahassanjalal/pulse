import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock prisma so the ledger is exercised in isolation (no real DB).
const tx = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  coinTransaction: { create: vi.fn() },
};
vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: (fn: any) => fn(tx),
  },
}));

import { adjustCoins, spendCoins, ApiError } from '../lib/coins';

describe('coins ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ coins: 100 });
    tx.user.update.mockResolvedValue({});
    tx.coinTransaction.create.mockResolvedValue({});
  });

  it('credits coins and records a transaction with the new balance', async () => {
    const balance = await adjustCoins('u1', 50, 'PURCHASE', 'pkg');
    expect(balance).toBe(150);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { coins: 150 } });
    expect(tx.coinTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 50, reason: 'PURCHASE', refId: 'pkg', balanceAfter: 150 },
    });
  });

  it('spendCoins decrements and rejects when balance would go negative', async () => {
    tx.user.findUnique.mockResolvedValue({ coins: 10 });
    const balance = await spendCoins('u1', 5, 'GIFT', 'u2');
    expect(balance).toBe(5);

    tx.user.findUnique.mockResolvedValue({ coins: 3 });
    await expect(spendCoins('u1', 10, 'GIFT', 'u2')).rejects.toBeInstanceOf(ApiError);
    await expect(spendCoins('u1', 10, 'GIFT', 'u2')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INSUFFICIENT_COINS',
    });
  });
});
