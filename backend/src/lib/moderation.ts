import { prisma } from './prisma';

export const UNLOCK_PRICE_USD = 10;

export const NUDITY_CATEGORIES = ['NUDITY', 'SEXUAL'] as const;

/**
 * Lock a user's account. Locked users can still log in but cannot match,
 * message, call, or manage friends (enforced in routes + socket handlers).
 */
export async function lockAccount(userId: string, reason: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { isLocked: true, lockReason: reason, lockUnlockedAt: null, status: 'OFFLINE' },
  });
}

/** Unlock a previously locked account (e.g. after the $10 unlock payment). */
export async function unlockAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { isLocked: false, lockReason: null, lockUnlockedAt: new Date() },
  });
}

/** True if the user is currently locked. */
export async function isLocked(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isLocked: true } });
  return !!user?.isLocked;
}
