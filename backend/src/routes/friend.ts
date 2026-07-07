import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';
import { NotificationService, isBlocked } from '../lib/notifications';

export default async function friendRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    
    const friends = await prisma.friend.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, displayName: true, profilePicture: true, status: true, lastSeen: true } },
        receiver: { select: { id: true, displayName: true, profilePicture: true, status: true, lastSeen: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const mapped = friends.map((f) => {
      const peer = f.senderId === userId ? f.receiver : f.sender;
      return {
        friendId: f.id,
        peer: {
          id: peer.id,
          displayName: peer.displayName,
          profilePicture: peer.profilePicture,
          status: peer.status,
          lastSeen: peer.lastSeen,
        },
        isFavorite: f.isFavorite,
      };
    });
    
    return { friends: mapped };
  });

  app.get('/requests', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    
    const received = await prisma.friendRequest.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      include: {
        fromUser: { select: { id: true, displayName: true, profilePicture: true, country: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const sent = await prisma.friendRequest.findMany({
      where: { fromUserId: userId, status: 'PENDING' },
      include: {
        toUser: { select: { id: true, displayName: true, profilePicture: true, country: true } },
      },
    });
    
    return { received, sent };
  });

  app.post('/request', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { toUserId } = req.body as { toUserId: string };

    if (!authUser.isPremium) {
      return reply.status(403).send({ error: 'Friend requests are a premium feature. Upgrade to send friend requests.' });
    }

    if (toUserId === userId) {
      return { error: 'Cannot send friend request to yourself' };
    }

    if (await isBlocked(userId, toUserId)) {
      return { error: 'Cannot send friend request to this user' };
    }
    
    const existing = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { fromUserId: userId, toUserId },
          { fromUserId: toUserId, toUserId: userId },
        ],
      },
    });
    
    if (existing) {
      return { error: 'Friend request already exists' };
    }
    
    const existingFriend = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: toUserId },
          { senderId: toUserId, receiverId: userId },
        ],
      },
    });
    
    if (existingFriend) {
      return { error: 'Already friends' };
    }
    
    const friendRequest = await prisma.friendRequest.create({
      data: { fromUserId: userId, toUserId },
      include: {
        fromUser: { select: { id: true, displayName: true } },
        toUser: { select: { id: true, displayName: true } },
      },
    });

    await NotificationService.friendRequest(toUserId, friendRequest.fromUser.displayName || 'Someone');

    return { friendRequest };
  });

  app.post('/requests/:id/accept', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { id } = req.params as { id: string };

    if (!authUser.isPremium) {
      return reply.status(403).send({ error: 'Accepting friend requests is a premium feature. Upgrade to accept.' });
    }

    const friendRequest = await prisma.friendRequest.findFirst({
      where: { id, toUserId: userId, status: 'PENDING' },
    });
    
    if (!friendRequest) {
      return { error: 'Friend request not found' };
    }
    
    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
    
    const friend = await prisma.friend.create({
      data: {
        senderId: friendRequest.fromUserId,
        receiverId: friendRequest.toUserId,
      },
    });
    
    await prisma.user.update({ where: { id: friendRequest.fromUserId }, data: { friendsCount: { increment: 1 } } });
    await prisma.user.update({ where: { id: friendRequest.toUserId }, data: { friendsCount: { increment: 1 } } });

    const accepter = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await NotificationService.friendAccepted(friendRequest.fromUserId, accepter?.displayName || 'Someone');

    return { friend };
  });

  app.post('/requests/:id/reject', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    
    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    
    return { success: true };
  });

  app.delete('/:id', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { id: friendId } = req.params as { id: string };
    
    const friend = await prisma.friend.findFirst({
      where: {
        id: friendId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });
    
    if (!friend) {
      return { error: 'Friend not found' };
    }
    
    await prisma.friend.delete({ where: { id: friendId } });
    
    await prisma.user.update({ where: { id: friend.senderId }, data: { friendsCount: { decrement: 1 } } });
    await prisma.user.update({ where: { id: friend.receiverId }, data: { friendsCount: { decrement: 1 } } });
    
    return { success: true };
  });

  app.put('/:id/favorite', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { id: friendId } = req.params as { id: string };
    
    const friend = await prisma.friend.findFirst({
      where: {
        id: friendId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });
    
    if (!friend) {
      return { error: 'Friend not found' };
    }
    
    const updated = await prisma.friend.update({
      where: { id: friendId },
      data: { isFavorite: !friend.isFavorite },
    });
    
    return { friend: updated };
  });
}