import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma so the ledger is exercised in isolation (no real DB).
const tx = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  coinTransaction: { create: vi.fn() },
  // The atomic UPDATE ... WHERE coins + amount >= 0 statement. The mock
  // emulates the database: 0 affected rows when the user is missing or the
  // balance would go negative.
  $executeRaw: vi.fn(),
};
vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: (fn: any) => fn(tx),
  },
}));

import { adjustCoins, spendCoins, ApiError } from '../lib/coins';

describe('coins ledger (atomic)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: credit succeeds (1 row affected) and balance reads back 150.
    tx.$executeRaw.mockResolvedValue(1);
    tx.user.findUnique.mockResolvedValue({ coins: 150 });
    tx.coinTransaction.create.mockResolvedValue({});
  });

  it('applies the balance change with a single guarded UPDATE and records the ledger', async () => {
    const balance = await adjustCoins('u1', 50, 'PURCHASE', 'pkg');
    expect(balance).toBe(150);
    // The update must be the atomic raw statement (no read-modify-write).
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.coinTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 50, reason: 'PURCHASE', refId: 'pkg', balanceAfter: 150 },
    });
    // The old non-atomic update path must not be used.
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('spendCoins decrements and rejects when balance would go negative', async () => {
    tx.$executeRaw.mockResolvedValueOnce(1);
    tx.user.findUnique.mockResolvedValue({ coins: 5 });
    const balance = await spendCoins('u1', 5, 'GIFT', 'u2');
    expect(balance).toBe(5);

    // Guarded UPDATE affects 0 rows when the balance would go negative —
    // the function must surface INSUFFICIENT_COINS and record NO ledger row.
    const ledgerCalls = tx.coinTransaction.create.mock.calls.length;
    tx.$executeRaw.mockResolvedValue(0);
    tx.user.findUnique.mockResolvedValue({ coins: 3 });
    await expect(spendCoins('u1', 10, 'GIFT', 'u2')).rejects.toBeInstanceOf(ApiError);
    await expect(spendCoins('u1', 10, 'GIFT', 'u2')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INSUFFICIENT_COINS',
    });
    expect(tx.coinTransaction.create.mock.calls.length).toBe(ledgerCalls);
  });

  it('rejects with USER_NOT_FOUND when the update matched no user', async () => {
    tx.$executeRaw.mockResolvedValue(0);
    tx.user.findUnique.mockResolvedValue(null);
    await expect(adjustCoins('ghost', 10, 'ADMIN')).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});
