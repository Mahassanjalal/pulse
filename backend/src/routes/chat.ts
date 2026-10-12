import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { SendMessageSchema, CreateConversationSchema } from '../lib/validators';
import { authenticate, getAuthUser, requireUnlocked } from '../middleware/auth';
import { NotificationService, isBlocked } from '../lib/notifications';
import { getFriendIds, getPeerId } from '../lib/relations';

/**
 * Match.deletedFor is a JSON array of user ids that locally hid this
 * conversation (soft delete — M6: hard-deleting destroyed the peer's history
 * and any moderation evidence).
 */
function parseHidden(json: string): string[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * H4 fix: keyset cursor over (createdAt, id). The old cursor compared
 * `id < cursor` while sorting by createdAt — but Message.id is a random UUID,
 * so the filter was meaningless and messages were randomly skipped. The cursor
 * is now base64("<ISO createdAt>|<id>") and both columns are used together.
 */
function encodeCursor(m: { createdAt: Date; id: string }): string {
  return Buffer.from(`${m.createdAt.toISOString()}|${m.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso!);
    if (!id || isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export default async function chatRoutes(app: FastifyInstance) {
  app.get('/conversations', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;

    // Get all friends of the current user
    const friendIds = await getFriendIds(userId);

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { user1Id: userId, user2Id: { in: friendIds } },
          { user2Id: userId, user1Id: { in: friendIds } },
        ],
        status: 'ENDED',
        // Hide conversations the user locally deleted (soft delete).
        NOT: { deletedFor: { contains: userId } },
      },
      include: {
        user1: { select: { id: true, displayName: true, profilePicture: true, status: true } },
        user2: { select: { id: true, displayName: true, profilePicture: true, status: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // H5 fix: unread counts previously only inspected the last 1 message, so
    // badges were always 0/1. One grouped count across all conversations.
    const matchIds = matches.map((m) => m.id);
    const unreadGroups = matchIds.length
      ? await prisma.message.groupBy({
          by: ['matchId'],
          where: {
            matchId: { in: matchIds },
            read: false,
            senderId: { not: userId },
          },
          _count: { _all: true },
        })
      : [];
    const unreadByMatch = new Map<string, number>(
      unreadGroups.map((g) => [g.matchId, g._count._all])
    );
    
    const conversations = matches.map((match) => {
      const peer = match.user1Id === userId ? match.user2 : match.user1;
      const lastMessage = match.messages[0];
      const unreadCount = unreadByMatch.get(match.id) ?? 0;
      
      return {
        id: match.id,
        peer: {
          id: peer.id,
          displayName: peer.displayName,
          profilePicture: peer.profilePicture,
          status: peer.status,
        },
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          createdAt: lastMessage.createdAt,
        } : null,
        unreadCount,
        createdAt: match.createdAt,
      };
    });
    
    return { conversations };
  });

  app.post('/conversations', { preHandler: [authenticate, requireUnlocked] }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { friendId } = CreateConversationSchema.parse(req.body);

    if (friendId === userId) {
      return reply.status(400).send({ error: 'Cannot start a conversation with yourself' });
    }

    if (await isBlocked(userId, friendId)) {
      return reply.status(403).send({ error: 'Cannot start a conversation with this user' });
    }

    const areFriends = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });

    if (!areFriends) {
      return reply.status(403).send({ error: 'You must be friends to start a conversation.' });
    }

    let match = await prisma.match.findFirst({
      where: {
        // Match ANY status so an in-flight (ACTIVE) call thread or a ended
        // one both resolve to the same single conversation for this pair.
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
      },
    });

    if (!match) {
      match = await prisma.match.create({
        data: {
          user1Id: userId,
          user2Id: friendId,
          status: 'ENDED',
        },
      });
    }

    return { conversationId: match.id };
  });

  app.delete('/conversations/:matchId', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { matchId } = req.params as { matchId: string };

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });

    if (!match) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    // M6: soft delete for THIS user only. The previous hard delete cascaded
    // to every message, silently destroying the peer's history and any
    // moderation evidence.
    const hidden = parseHidden(match.deletedFor);
    if (!hidden.includes(userId)) hidden.push(userId);
    await prisma.match.update({
      where: { id: matchId },
      data: { deletedFor: JSON.stringify(hidden) },
    });

    return { success: true };
  });

  app.get('/messages/:matchId', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { matchId } = req.params as { matchId: string };
    const { cursor, limit = '50' } = req.query as { cursor?: string; limit?: string };
    
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });

    if (!match) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    // Check if users are friends
    const peerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const areFriends = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: peerId },
          { senderId: peerId, receiverId: userId },
        ],
      },
    });

    if (!areFriends) {
      return reply.status(403).send({ error: 'You must be friends to view messages. Send a friend request first.' });
    }

    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const where: Record<string, any> = { matchId };
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return reply.status(400).send({ error: 'Invalid cursor' });
      }
      // Keyset over (createdAt, id) — stable even when two messages share a
      // timestamp (H4).
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.id } },
      ];
    }
    
    const messages = await prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    
    const hasMore = messages.length > take;
    const paginated = hasMore ? messages.slice(0, take) : messages;
    const lastMessage = paginated[paginated.length - 1];
    const nextCursor = hasMore && lastMessage ? encodeCursor(lastMessage) : undefined;
    
    const incomingIds = paginated
      .filter((m) => m.senderId !== userId && !m.read)
      .map((m) => m.id);
    
    if (incomingIds.length > 0) {
      await prisma.message.updateMany({
        where: { id: { in: incomingIds } },
        data: { read: true, readAt: new Date() },
      });
    }
    
    return {
      messages: paginated.reverse(),
      nextCursor,
    };
  });

  app.post('/messages', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const data = SendMessageSchema.parse(req.body);
    
    const match = await prisma.match.findFirst({
      where: {
        id: data.matchId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });
    
    if (!match) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const receiverId = match.user1Id === userId ? match.user2Id : match.user1Id;

    // Check if users are friends
    const areFriends = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ],
      },
    });

    if (!areFriends) {
      return reply.status(403).send({ error: 'You must be friends to send messages. Send a friend request first.' });
    }

    if (await isBlocked(userId, receiverId)) {
      return reply.status(403).send({ error: 'Cannot send message to this user' });
    }
    
    const message = await prisma.message.create({
      data: {
        matchId: data.matchId,
        senderId: userId,
        receiverId,
        content: data.content,
        type: data.type,
      },
    });

    // Sending a message re-surfaces the conversation for the sender if they
    // had locally hidden it.
    const senderHidden = parseHidden(match.deletedFor);
    if (senderHidden.includes(userId)) {
      await prisma.match.update({
        where: { id: data.matchId },
        data: { deletedFor: JSON.stringify(senderHidden.filter((id) => id !== userId)) },
      });
    }

    // Real-time delivery to the recipient's socket room (works for both
    // in-match and friend/REST conversations).
    try {
      const io = (req as any).server.io as { to: (room: string) => { emit: (event: string, payload: any) => void } };
      const full = await prisma.message.findUnique({ where: { id: message.id } });
      io.to(`user_${receiverId}`).emit('match_message', full);
    } catch (e) {
      // socket emit is best-effort; persistence already succeeded
    }

    // M2: don't create a notification per message (write amplification +
    // badge spam). Only notify when this is the receiver's first unread in the
    // conversation — a "you have unread messages" nudge, one row per burst.
    const receiverUnread = await prisma.message.count({
      where: { matchId: data.matchId, receiverId, read: false },
    });
    if (receiverUnread <= 1) {
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      await NotificationService.newMessage(receiverId, sender?.displayName || 'Someone');
    }

    return { message };
  });

  app.post('/messages/:id/read', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id } = req.params as { id: string };
    
    // H6: only the RECEIVER of a message may mark it read — previously any
    // authenticated user could flip any message's read flag by id (IDOR).
    const result = await prisma.message.updateMany({
      where: { id, receiverId: authUser.id },
      data: { read: true, readAt: new Date() },
    });
    
    if (result.count === 0) {
      return { success: false, error: 'Message not found or not yours' };
    }
    return { success: true };
  });
}