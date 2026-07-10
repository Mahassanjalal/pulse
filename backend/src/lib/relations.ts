import { prisma } from './prisma';

/**
 * Shared relationship helpers used across routes and socket handlers to remove
 * duplicated "get my friend IDs", "resolve the peer in a match", and
 * "find an existing friend request" logic.
 */

/** The other user's id in a match given the current user's id. Works with both
 *  `{ user1Id, user2Id }` (Prisma Match) and `{ user1, user2 }` (live socket
 *  match objects). */
export function getPeerId(
  match: { user1Id?: string; user2Id?: string; user1?: string; user2?: string },
  userId: string
): string {
  const a = match.user1Id ?? match.user1!;
  const b = match.user2Id ?? match.user2!;
  return a === userId ? b : a;
}

/** Ids of all users who are friends with `userId` (both directions). */
export async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friend.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    select: { senderId: true, receiverId: true },
  });
  return friendships.map((f) => (f.senderId === userId ? f.receiverId : f.senderId));
}

/** True if `userId` and `peerId` are friends. */
export async function isFriend(userId: string, peerId: string): Promise<boolean> {
  const friend = await prisma.friend.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: peerId },
        { senderId: peerId, receiverId: userId },
      ],
    },
  });
  return !!friend;
}

/** An existing (pending) friend request between two users in either direction, if any. */
export function findFriendRequest(userId: string, peerId: string) {
  return prisma.friendRequest.findFirst({
    where: {
      OR: [
        { fromUserId: userId, toUserId: peerId },
        { fromUserId: peerId, toUserId: userId },
      ],
    },
  });
}
