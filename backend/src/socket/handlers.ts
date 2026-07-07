import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { NotificationService, isBlocked } from '../lib/notifications';

interface SocketAuth extends Socket {
  userId?: string;
  gender?: string;
  isPremium?: boolean;
}

const waitingUsers = new Map<string, { socketId: string; filters?: any }>();
const activeMatches = new Map<string, { user1: string; user2: string; matchId: string; startTime: number }>();

// Multi-tab connection tracking: userId -> Set<socketId>
const userConnections = new Map<string, Set<string>>();
// Heartbeat timers: socketId -> timeout handle
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

const HEARTBEAT_TIMEOUT = 90000; // 90s without heartbeat -> disconnect

async function broadcastPresence(io: Server, userId: string, status: string, lastSeen: Date): Promise<void> {
  try {
    const friends = await prisma.friend.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        senderId: true,
        receiverId: true,
      },
    });

    const friendIds = friends.map(f => (f.senderId === userId ? f.receiverId : f.senderId));

    for (const friendId of friendIds) {
      io.to(`user_${friendId}`).emit('presence_changed', { userId, status, lastSeen });
    }
  } catch (err) {
    console.error('Broadcast presence error:', err);
  }
}

function resetHeartbeat(socket: Socket, userId: string): void {
  const existing = heartbeatTimers.get(socket.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    console.log(`Heartbeat timeout for ${socket.id} (user: ${userId})`);
    socket.disconnect();
  }, HEARTBEAT_TIMEOUT);

  heartbeatTimers.set(socket.id, timer);
}

export function setupSocketHandlers(io: Server, app: FastifyInstance) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = app.jwt.verify<{ userId: string }>(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, status: true, gender: true, isPremium: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      const authSocket = socket as SocketAuth;
      authSocket.userId = user.id;
      authSocket.gender = user.gender || undefined;
      authSocket.isPremium = user.isPremium;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const authSocket = socket as SocketAuth;
    const userId = authSocket.userId!;

    console.log(`Socket connected: ${socket.id} (user: ${userId})`);

    // Join user's personal room
    socket.join(`user_${userId}`);

    // Multi-tab connection tracking
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    const connections = userConnections.get(userId)!;
    const wasOffline = connections.size === 0;
    connections.add(socket.id);

    // Start heartbeat timer
    resetHeartbeat(socket, userId);

    // If this is the first connection, mark as ONLINE and broadcast
    if (wasOffline) {
      prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE', lastSeen: new Date() },
      }).then(() => {
        broadcastPresence(io, userId, 'ONLINE', new Date());
      }).catch(err => console.error('Status update error:', err));
    }

    // ======================================
    // HEARTBEAT
    // ======================================

    socket.on('heartbeat', () => {
      resetHeartbeat(socket, userId);
      prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() },
      }).catch(() => {});
      socket.emit('pong');
    });

    // ======================================
    // PRESENCE SYNC
    // ======================================

    socket.on('presence_sync', async (data: { userIds: string[] }) => {
      const users = await prisma.user.findMany({
        where: { id: { in: data.userIds } },
        select: { id: true, status: true, lastSeen: true },
      });
      socket.emit('presence_sync_result', { users });
    });

    // ======================================
    // MATCHING EVENTS
    // ======================================

    socket.on('start_matching', async (data) => {
      console.log(`User ${userId} started matching`);

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'MATCHING' },
      });

      const userGender = authSocket.gender;
      const isPremium = authSocket.isPremium;

      waitingUsers.set(userId, {
        socketId: socket.id,
        filters: isPremium ? data?.filters : undefined,
      });

      let targetGender: string | null = null;
      if (!isPremium && userGender) {
        const roll = Math.random();
        targetGender = roll < 0.75 ? userGender : (userGender === 'MALE' ? 'FEMALE' : 'MALE');
      }

      for (const [waitingUserId, waitingData] of waitingUsers) {
        if (waitingUserId !== userId) {
          if (await isBlocked(userId, waitingUserId)) continue;

          if (targetGender) {
            const peerUser = await prisma.user.findUnique({
              where: { id: waitingUserId },
              select: { gender: true },
            });
            if (peerUser && peerUser.gender !== targetGender) continue;
          }

          waitingUsers.delete(waitingUserId);
          waitingUsers.delete(userId);

          const [peer1, peer2] = await Promise.all([
            prisma.user.findUnique({
              where: { id: waitingUserId },
              select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, isVerified: true, isPremium: true },
            }),
            prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, isVerified: true, isPremium: true },
            }),
          ]);

          if (!peer1 || !peer2) return;

          const peer1Interests: string[] = JSON.parse(peer1.interests || '[]');
          const peer2Interests: string[] = JSON.parse(peer2.interests || '[]');
          const mutual = peer1Interests.filter((i: string) => peer2Interests.includes(i));

          const match = await prisma.match.create({
            data: {
              user1Id: waitingUserId,
              user2Id: userId,
              status: 'ACTIVE',
              mutualInterests: JSON.stringify(mutual),
            },
          });

          activeMatches.set(match.id, { user1: waitingUserId, user2: userId, matchId: match.id, startTime: Date.now() });

          io.to(waitingData.socketId).emit('match_found', {
            matchId: match.id,
            peer: {
              id: peer2.id,
              displayName: peer2.displayName,
              profilePicture: peer2.profilePicture,
              age: peer2.age,
              country: peer2.country,
              interests: peer2Interests,
              isVerified: peer2.isVerified,
              isPremium: peer2.isPremium,
            },
          });

          io.to(socket.id).emit('match_found', {
            matchId: match.id,
            peer: {
              id: peer1.id,
              displayName: peer1.displayName,
              profilePicture: peer1.profilePicture,
              age: peer1.age,
              country: peer1.country,
              interests: peer1Interests,
              isVerified: peer1.isVerified,
              isPremium: peer1.isPremium,
            },
          });

          return;
        }
      }

      socket.emit('matching_queue', { queuePosition: waitingUsers.size, status: 'waiting' });
    });

    socket.on('cancel_matching', async () => {
      waitingUsers.delete(userId);

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE' },
      });

      socket.emit('matching_cancelled');
    });

    // ======================================
    // WebRTC SIGNALING
    // ======================================

    socket.on('webrtc_offer', (data: { matchId: string; offer: any }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      io.to(`user_${otherUserId}`).emit('webrtc_offer', {
        offer: data.offer,
        fromUserId: userId,
      });
    });

    socket.on('webrtc_answer', (data: { matchId: string; answer: any }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      io.to(`user_${otherUserId}`).emit('webrtc_answer', {
        answer: data.answer,
        fromUserId: userId,
      });
    });

    socket.on('webrtc_candidate', (data: { matchId: string; candidate: any }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      io.to(`user_${otherUserId}`).emit('webrtc_candidate', {
        candidate: data.candidate,
        fromUserId: userId,
      });
    });

    // ======================================
    // IN-MATCH CHAT
    // ======================================

    socket.on('send_match_message', async (data: { matchId: string; content: string; type?: string }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      try {
        const otherUserId = match.user1 === userId ? match.user2 : match.user1;

        const message = await prisma.message.create({
          data: {
            matchId: data.matchId,
            senderId: userId,
            receiverId: otherUserId,
            content: data.content,
            type: (data.type as any) || 'TEXT',
          },
        });

        io.to(`user_${otherUserId}`).emit('match_message', message);
        socket.emit('match_message_sent', message);
      } catch (err) {
        console.error('Message error:', err);
      }
    });

    socket.on('typing', (data: { matchId: string; isTyping: boolean }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      io.to(`user_${otherUserId}`).emit('peer_typing', { isTyping: data.isTyping });
    });

    // ======================================
    // MATCH CONTROLS
    // ======================================

    socket.on('skip_match', async (data: { matchId: string }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      await prisma.match.update({
        where: { id: data.matchId },
        data: { status: 'SKIPPED', endTime: new Date() },
      });

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      activeMatches.delete(data.matchId);

      io.to(`user_${otherUserId}`).emit('match_skipped', { matchId: data.matchId });
      socket.emit('match_ended', { matchId: data.matchId, reason: 'skipped' });
    });

    socket.on('end_match', async (data: { matchId: string }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const duration = Math.floor((Date.now() - match.startTime) / 1000);

      await prisma.match.update({
        where: { id: data.matchId },
        data: { status: 'ENDED', endTime: new Date(), duration },
      });

      const otherUserId = match.user1 === userId ? match.user2 : match.user1;
      activeMatches.delete(data.matchId);

      await Promise.all([
        prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
        prisma.user.update({ where: { id: otherUserId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
      ]);

      io.to(`user_${otherUserId}`).emit('match_ended', { matchId: data.matchId, reason: 'ended' });
      socket.emit('match_ended', { matchId: data.matchId, reason: 'ended' });
    });

    // ======================================
    // SOCIAL - Friend Request During Match
    // ======================================

    socket.on('add_friend', async (data: { peerId: string }) => {
      try {
        if (!authSocket.isPremium) {
          socket.emit('error', { message: 'Friend requests are a premium feature. Upgrade to send friend requests.' });
          return;
        }

        const existing = await prisma.friendRequest.findFirst({
          where: {
            OR: [
              { fromUserId: userId, toUserId: data.peerId },
              { fromUserId: data.peerId, toUserId: userId },
            ],
          },
        });

        if (!existing) {
          await prisma.friendRequest.create({
            data: { fromUserId: userId, toUserId: data.peerId },
          });

          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true },
          });

          await NotificationService.friendRequest(data.peerId, sender?.displayName || 'Someone');
        }

        io.to(`user_${data.peerId}`).emit('friend_request_notification', {
          fromUserId: userId,
          message: 'Someone wants to be your friend!',
        });
      } catch (err) {
        console.error('Add friend error:', err);
      }
    });

    // ======================================
    // DISCONNECT
    // ======================================

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id} (user: ${userId})`);

      // Clear heartbeat timer
      const timer = heartbeatTimers.get(socket.id);
      if (timer) {
        clearTimeout(timer);
        heartbeatTimers.delete(socket.id);
      }

      // Remove from waiting pool
      waitingUsers.delete(userId);

      // Multi-tab: only go OFFLINE if this was the last connection
      const connections = userConnections.get(userId);
      if (connections) {
        connections.delete(socket.id);
        if (connections.size === 0) {
          userConnections.delete(userId);
          const now = new Date();
          await prisma.user.update({
            where: { id: userId },
            data: { status: 'OFFLINE', lastSeen: now },
          });
          broadcastPresence(io, userId, 'OFFLINE', now);
        }
      }
    });
  });
}
