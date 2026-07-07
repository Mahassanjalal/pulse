import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { NotificationService, isBlocked } from '../lib/notifications';

interface SocketAuth extends Socket {
  userId?: string;
}

const waitingUsers = new Map<string, { socketId: string; filters?: any }>();
const activeMatches = new Map<string, { user1: string; user2: string; matchId: string; startTime: number }>();

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
        select: { id: true, status: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      (socket as SocketAuth).userId = user.id;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const authSocket = socket as SocketAuth;
    const userId = authSocket.userId!;
    
    console.log(`Socket connected: ${socket.id} (user: ${userId})`);
    
    // Join user's personal room for notifications
    socket.join(`user_${userId}`);

    // Update user status
    prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE', lastSeen: new Date() },
    }).catch(err => console.error('Status update error:', err));

    // ======================================
    // MATCHING EVENTS
    // ======================================

    socket.on('start_matching', async (data) => {
      console.log(`User ${userId} started matching`);
      
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'MATCHING' },
      });

      waitingUsers.set(userId, { socketId: socket.id, filters: data?.filters });

      // Search for a match
      for (const [waitingUserId, waitingData] of waitingUsers) {
        if (waitingUserId !== userId) {
          if (await isBlocked(userId, waitingUserId)) continue;
          
          waitingUsers.delete(waitingUserId);
          waitingUsers.delete(userId);

          // Get user details
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

          // Create match record
          const match = await prisma.match.create({
            data: {
              user1Id: waitingUserId,
              user2Id: userId,
              status: 'ACTIVE',
              mutualInterests: JSON.stringify(mutual),
            },
          });

          activeMatches.set(match.id, { user1: waitingUserId, user2: userId, matchId: match.id, startTime: Date.now() });

          // Emit match found
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

      // No match found, notify user they are in queue
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

      // Update user statuses
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

      // Remove from waiting pool
      waitingUsers.delete(userId);

      // Update user status
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'OFFLINE', lastSeen: new Date() },
      });
    });
  });
}