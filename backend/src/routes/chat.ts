import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { SendMessageSchema, CreateConversationSchema } from '../lib/validators';
import { authenticate, getAuthUser, requireUnlocked } from '../middleware/auth';
import { NotificationService, isBlocked } from '../lib/notifications';
import { getFriendIds, getPeerId } from '../lib/relations';

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
    
    const conversations = matches.map((match) => {
      const peer = match.user1Id === userId ? match.user2 : match.user1;
      const lastMessage = match.messages[0];
      const unreadCount = match.messages.filter(
        (m) => !m.read && m.senderId !== userId
      ).length;
      
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

    // Deleting the match cascades to its messages (onDelete: Cascade).
    await prisma.match.delete({ where: { id: matchId } });

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

    const where: Record<string, any> = { matchId };
    if (cursor) {
      where.id = { lt: cursor };
    }
    
    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit) + 1,
    });
    
    const hasMore = messages.length > Number(limit);
    const paginated = hasMore ? messages.slice(0, Number(limit)) : messages;
    const lastMessage = paginated[paginated.length - 1];
    const nextCursor = hasMore && lastMessage ? lastMessage.id : undefined;
    
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

    // Real-time delivery to the recipient's socket room (works for both
    // in-match and friend/REST conversations).
    try {
      const io = (req as any).server.io as { to: (room: string) => { emit: (event: string, payload: any) => void } };
      const full = await prisma.message.findUnique({ where: { id: message.id } });
      io.to(`user_${receiverId}`).emit('match_message', full);
    } catch (e) {
      // socket emit is best-effort; persistence already succeeded
    }

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await NotificationService.newMessage(receiverId, sender?.displayName || 'Someone');

    return { message };
  });

  app.post('/messages/:id/read', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    
    await prisma.message.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    
    return { success: true };
  });
}