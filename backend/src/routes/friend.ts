import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser, requireUnlocked } from '../middleware/auth';
import { NotificationService, isBlocked } from '../lib/notifications';
import { getPeerId, findFriendRequest, isFriend } from '../lib/relations';
import { unlockAchievement } from '../lib/achievements';

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
      return reply.status(400).send({ error: 'Cannot send friend request to yourself' });
    }

    if (await isBlocked(userId, toUserId)) {
      return reply.status(403).send({ error: 'Cannot send friend request to this user' });
    }
    
    const existing = await findFriendRequest(userId, toUserId);
    
    if (existing) {
      return reply.status(409).send({ error: 'Friend request already exists' });
    }
    
    const existingFriend = await isFriend(userId, toUserId);
    
    if (existingFriend) {
      return reply.status(409).send({ error: 'Already friends' });
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
      return reply.status(404).send({ error: 'Friend request not found' });
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

    // Unlock the "first friend" achievement for both participants.
    await unlockAchievement(friendRequest.fromUserId, 'first_friend', 1);
    await unlockAchievement(friendRequest.toUserId, 'first_friend', 1);

    const accepter = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await NotificationService.friendAccepted(friendRequest.fromUserId, accepter?.displayName || 'Someone');

    // Real-time push to the requester (frontend listens for these events).
    const io = (req as any).server.io;
    if (io) {
      io.to(`user_${friendRequest.fromUserId}`).emit('friend_request_accepted', {
        requestId: friendRequest.id,
        friendId: friend.id,
        byUserId: userId,
      });
      io.to(`user_${friendRequest.fromUserId}`).emit('friend_added', {
        friendId: friend.id,
        peer: { id: userId, displayName: accepter?.displayName || 'Someone' },
      });
    }

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

  app.delete('/:id', { preHandler: [authenticate, requireUnlocked] }, async (req, reply) => {
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
      return reply.status(404).send({ error: 'Friend not found' });
    }
    
    await prisma.friend.delete({ where: { id: friendId } });
    
    await prisma.user.update({ where: { id: friend.senderId }, data: { friendsCount: { decrement: 1 } } });
    await prisma.user.update({ where: { id: friend.receiverId }, data: { friendsCount: { decrement: 1 } } });
    
    return { success: true };
  });

  app.put('/:id/favorite', { preHandler: authenticate }, async (req, reply) => {
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
      return reply.status(404).send({ error: 'Friend not found' });
    }
    
    const updated = await prisma.friend.update({
      where: { id: friendId },
      data: { isFavorite: !friend.isFavorite },
    });
    
    return { friend: updated };
  });
}