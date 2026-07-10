import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { NotificationService, isBlocked } from '../lib/notifications';
import { getPeerId, findFriendRequest } from '../lib/relations';
import { unlockAchievement, type AchievementKey } from '../lib/achievements';

async function unlockConversationAchievements(userId: string, total: number): Promise<void> {
  await unlockAchievement(userId, 'first_conversation', 1);
  await unlockAchievement(userId, 'conversations_10', total);
  await unlockAchievement(userId, 'conversations_100', total);
}

interface SocketAuth extends Socket {
  userId?: string;
  gender?: string;
  isPremium?: boolean;
  isLocked?: boolean;
}

const waitingUsers = new Map<string, { socketId: string; filters?: any }>();
const activeMatches = new Map<string, { user1: string; user2: string; matchId: string; startTime: number }>();
const pendingCalls = new Map<string, { callerId: string; calleeId: string }>();

// Multi-tab connection tracking: userId -> Set<socketId>
const userConnections = new Map<string, Set<string>>();
// Heartbeat timers: socketId -> timeout handle
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

const HEARTBEAT_TIMEOUT = 90000; // 90s without heartbeat -> disconnect

const peerSelect = {
  id: true,
  username: true,
  displayName: true,
  age: true,
  country: true,
  interests: true,
  profilePicture: true,
  gender: true,
  isVerified: true,
  isPremium: true,
};

function isUserInMatch(userId: string): boolean {
  for (const m of activeMatches.values()) {
    if (m.user1 === userId || m.user2 === userId) return true;
  }
  return false;
}

function toPeer(user: any, interests: string[]) {
  return {
    id: user.id,
    displayName: user.displayName,
    profilePicture: user.profilePicture,
    age: user.age,
    country: user.country,
    interests,
    isVerified: user.isVerified,
    isPremium: user.isPremium,
  };
}

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
        select: { id: true, status: true, gender: true, isPremium: true, isLocked: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      const authSocket = socket as SocketAuth;
      authSocket.userId = user.id;
      authSocket.gender = user.gender || undefined;
      authSocket.isPremium = user.isPremium;
      authSocket.isLocked = user.isLocked;
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
      if (authSocket.isLocked) {
        socket.emit('error', { message: 'Account locked. Pay $10 to unlock and reconnect.', code: 'ACCOUNT_LOCKED' });
        return;
      }

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
              select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, status: true, isVerified: true, isPremium: true },
            }),
            prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, status: true, isVerified: true, isPremium: true },
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
            isInitiator: match.user1Id === waitingUserId,
            peer: {
              id: peer2.id,
              displayName: peer2.displayName,
              profilePicture: peer2.profilePicture,
              age: peer2.age,
              country: peer2.country,
              interests: peer2Interests,
              gender: peer2.gender,
              status: peer2.status,
              isVerified: peer2.isVerified,
              isPremium: peer2.isPremium,
            },
          });

          io.to(socket.id).emit('match_found', {
            matchId: match.id,
            isInitiator: match.user1Id === userId,
            peer: {
              id: peer1.id,
              displayName: peer1.displayName,
              profilePicture: peer1.profilePicture,
              age: peer1.age,
              country: peer1.country,
              interests: peer1Interests,
              gender: peer1.gender,
              status: peer1.status,
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

      const otherUserId = getPeerId(match, userId);
      io.to(`user_${otherUserId}`).emit('webrtc_offer', {
        offer: data.offer,
        fromUserId: userId,
      });
    });

    socket.on('webrtc_answer', (data: { matchId: string; answer: any }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const otherUserId = getPeerId(match, userId);
      io.to(`user_${otherUserId}`).emit('webrtc_answer', {
        answer: data.answer,
        fromUserId: userId,
      });
    });

    socket.on('webrtc_candidate', (data: { matchId: string; candidate: any }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      const otherUserId = getPeerId(match, userId);
      io.to(`user_${otherUserId}`).emit('webrtc_candidate', {
        candidate: data.candidate,
        fromUserId: userId,
      });
    });

    // ======================================
    // FRIEND CALLS (direct 1:1 video)
    // ======================================

    socket.on('call_friend', async (data: { friendId: string }) => {
      const friendId = data?.friendId;
      if (!friendId) {
        socket.emit('call_error', { message: 'Invalid call request' });
        return;
      }
      if (friendId === userId) {
        socket.emit('call_error', { message: 'Cannot call yourself' });
        return;
      }
      if (authSocket.isLocked) {
        socket.emit('call_error', { message: 'Account locked. Cannot start a call.' });
        return;
      }

      const existingFriend = await prisma.friend.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: friendId },
            { senderId: friendId, receiverId: userId },
          ],
        },
      });
      if (!existingFriend) {
        socket.emit('call_error', { message: 'You must be friends to call this user' });
        return;
      }
      if (await isBlocked(userId, friendId)) {
        socket.emit('call_error', { message: 'Cannot call this user' });
        return;
      }
      if (isUserInMatch(userId)) {
        socket.emit('call_error', { message: 'You are already in a call' });
        return;
      }
      if (isUserInMatch(friendId)) {
        socket.emit('call_error', { message: 'User is busy in another call' });
        return;
      }
      const calleeConns = userConnections.get(friendId);
      if (!calleeConns || calleeConns.size === 0) {
        socket.emit('call_error', { message: 'User is offline' });
        return;
      }

      const callId = uuidv4();
      pendingCalls.set(callId, { callerId: userId, calleeId: friendId });

      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, profilePicture: true },
      });

      io.to(`user_${friendId}`).emit('incoming_call', {
        callId,
        caller: {
          id: caller?.id,
          displayName: caller?.displayName,
          profilePicture: caller?.profilePicture,
        },
      });
    });

    socket.on('accept_call', async (data: { callId: string }) => {
      const pending = data?.callId ? pendingCalls.get(data.callId) : null;
      if (!pending || pending.calleeId !== userId) {
        socket.emit('call_error', { message: 'Call is no longer available' });
        return;
      }
      pendingCalls.delete(data.callId);

      const match = await prisma.match.create({
        data: {
          user1Id: pending.callerId,
          user2Id: pending.calleeId,
          status: 'ACTIVE',
        },
      });
      activeMatches.set(match.id, {
        user1: pending.callerId,
        user2: pending.calleeId,
        matchId: match.id,
        startTime: Date.now(),
      });

      const [callerUser, calleeUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: pending.callerId }, select: peerSelect }),
        prisma.user.findUnique({ where: { id: pending.calleeId }, select: peerSelect }),
      ]);
      if (!callerUser || !calleeUser) {
        socket.emit('call_error', { message: 'Call failed' });
        return;
      }

      const callerInterests: string[] = JSON.parse(callerUser.interests || '[]');
      const calleeInterests: string[] = JSON.parse(calleeUser.interests || '[]');

      io.to(`user_${pending.callerId}`).emit('match_found', {
        matchId: match.id,
        isInitiator: true,
        peer: toPeer(calleeUser, calleeInterests),
      });
      io.to(`user_${pending.calleeId}`).emit('match_found', {
        matchId: match.id,
        isInitiator: false,
        peer: toPeer(callerUser, callerInterests),
      });
    });

    socket.on('decline_call', (data: { callId: string }) => {
      const pending = data?.callId ? pendingCalls.get(data.callId) : null;
      if (!pending) return;
      if (pending.calleeId !== userId && pending.callerId !== userId) return;
      pendingCalls.delete(data.callId);
      io.to(`user_${pending.callerId}`).emit('call_declined', { callId: data.callId });
    });

    socket.on('cancel_call', (data: { callId: string }) => {
      const pending = data?.callId ? pendingCalls.get(data.callId) : null;
      if (!pending) return;
      if (pending.callerId !== userId) return;
      pendingCalls.delete(data.callId);
      io.to(`user_${pending.calleeId}`).emit('call_cancelled', { callId: data.callId });
    });

    // ======================================
    // IN-MATCH CHAT
    // ======================================

    socket.on('send_match_message', async (data: { matchId: string; content: string; type?: string }) => {
      const match = activeMatches.get(data.matchId);
      if (!match) return;

      try {
        const otherUserId = getPeerId(match, userId);

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

    socket.on('typing', async (data: { matchId: string; isTyping: boolean }) => {
      let otherUserId: string | undefined;

      const match = activeMatches.get(data.matchId);
      if (match) {
        otherUserId = match.user1 === userId ? match.user2 : match.user1;
      } else {
        // Fallback for friend/REST conversations (status ENDED) which are not
        // in the live activeMatches map.
        const dbMatch = await prisma.match.findFirst({
          where: { id: data.matchId, OR: [{ user1Id: userId }, { user2Id: userId }] },
          select: { user1Id: true, user2Id: true },
        });
        if (dbMatch) {
          otherUserId = dbMatch.user1Id === userId ? dbMatch.user2Id : dbMatch.user1Id;
        }
      }

      if (!otherUserId) return;
      io.to(`user_${otherUserId}`).emit('peer_typing', { matchId: data.matchId, isTyping: data.isTyping });
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

      const otherUserId = getPeerId(match, userId);
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

      const otherUserId = getPeerId(match, userId);
      activeMatches.delete(data.matchId);

      await Promise.all([
        prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
        prisma.user.update({ where: { id: otherUserId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
      ]);

      // Unlock conversation-based achievements for both participants.
      const [me, peer] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { totalConversations: true } }),
        prisma.user.findUnique({ where: { id: otherUserId }, select: { totalConversations: true } }),
      ]);
      if (me) await unlockConversationAchievements(userId, me.totalConversations);
      if (peer) await unlockConversationAchievements(otherUserId, peer.totalConversations);

      io.to(`user_${otherUserId}`).emit('match_ended', { matchId: data.matchId, reason: 'ended' });
      socket.emit('match_ended', { matchId: data.matchId, reason: 'ended' });

      const peerUser = await prisma.user.findUnique({ where: { id: otherUserId }, select: { displayName: true } });
      await NotificationService.matchEnded(otherUserId, peerUser?.displayName || 'Someone');
    });

    // ======================================
    // SOCIAL - Friend Request During Match
    // ======================================

    socket.on('add_friend', async (data: { peerId: string }) => {
      try {
        if (authSocket.isLocked) {
          socket.emit('error', { message: 'Account locked. Pay $10 to unlock and reconnect.', code: 'ACCOUNT_LOCKED' });
          return;
        }

        if (!authSocket.isPremium) {
          socket.emit('error', { message: 'Friend requests are a premium feature. Upgrade to send friend requests.' });
          return;
        }

        if (data.peerId === userId) {
          socket.emit('error', { message: 'Cannot send a friend request to yourself' });
          return;
        }

        if (await isBlocked(userId, data.peerId)) {
          socket.emit('error', { message: 'Cannot send friend request to this user' });
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

        const existingFriend = await prisma.friend.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: data.peerId },
              { senderId: data.peerId, receiverId: userId },
            ],
          },
        });

        if (existing || existingFriend) {
          socket.emit('error', { message: 'Friend request already exists or you are already friends' });
          return;
        }

        await prisma.friendRequest.create({
          data: { fromUserId: userId, toUserId: data.peerId },
        });

        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true },
        });

        await NotificationService.friendRequest(data.peerId, sender?.displayName || 'Someone');

        io.to(`user_${data.peerId}`).emit('friend_request_notification', {
          fromUserId: userId,
          message: 'Someone wants to be your friend!',
        });
        io.to(`user_${data.peerId}`).emit('friend_request_received', {
          fromUserId: userId,
          fromUserName: sender?.displayName || 'Someone',
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