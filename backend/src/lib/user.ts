import { prisma } from './prisma';

/**
 * Computes the real friend count and conversation (match) count for a user
 * from the actual relations in the database, then returns a copy of `user`
 * with those fields overwritten. This avoids relying on the stale/denormalized
 * counter columns that may have been seeded with dummy values.
 */
export async function withRealCounts<T extends Record<string, any>>(userId: string, user: T): Promise<T> {
  const [friendsCount, totalConversations] = await Promise.all([
    prisma.friend.count({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    }),
    prisma.match.count({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    }),
  ]);

  return { ...user, friendsCount, totalConversations };
}
