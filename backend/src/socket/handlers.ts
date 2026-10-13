import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { NotificationService, isBlocked } from '../lib/notifications';
import { getPeerId, findFriendRequest } from '../lib/relations';
import { unlockAchievement, type AchievementKey } from '../lib/achievements';
import { SendMessageSchema } from '../lib/validators';
import { hit } from '../lib/limits';
import { setRealtimeHooks } from '../lib/realtime';
import { getStore, type RealtimeStateStore, type QueueEntry } from '../lib/state';

// Active Socket.IO server reference, set in setupSocketHandlers. Used by the
// kickUser realtime hook (account locks, moderation).
let activeIo: Server | null = null;

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

// Phase 1: queue/claims/matches/pending-calls/socket-registry/presence all
// live behind RealtimeStateStore (Redis when REDIS_URL is set, memory
// otherwise) so multiple API nodes share one realtime view. Only NODE-LOCAL
// things remain as Maps here:
//  - pending call ring timers (owned by the node that created the call)
//  - heartbeat timers (owned by the node that owns the socket)
const pendingCallTimers = new Map<string, NodeJS.Timeout>();
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

/** Shortcut to the active state store. */
function store(): RealtimeStateStore {
  return getStore();
}

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

/**
 * Tear down an in-memory active match (DB update + events to both peers).
 * Shared by end/skip handlers and the moderation kick path.
 */
async function teardownMatch(
  io: Server,
  matchId: string,
  reason: 'ended' | 'skipped' | 'moderation',
): Promise<void> {
  // Atomic take from the shared store — two nodes racing teardown (e.g. both
  // peers ending at once) can't both process it.
  const match = await store().deleteMatch(matchId);
  if (!match) return;

  const duration = Math.floor((Date.now() - match.startTime) / 1000);
  try {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: reason === 'skipped' ? 'SKIPPED' : 'ENDED',
        endTime: new Date(),
        duration,
      },
    });
  } catch (err) {
    console.error('teardownMatch db error:', err);
  }

  io.to(`user_${match.user1}`).emit(reason === 'skipped' ? 'match_skipped' : 'match_ended', { matchId, reason });
  io.to(`user_${match.user2}`).emit(reason === 'skipped' ? 'match_skipped' : 'match_ended', { matchId, reason });
}

async function isUserInMatch(userId: string): Promise<boolean> {
  // O(1) set membership in Redis (was a full scan of every active match).
  return store().isUserInMatch(userId);
}

// Gender-bias grace: pairing only ever consulted the JOINING user's random
// gender roll, and nobody ever rescanned the queue — so two users of
// different genders could wait forever when both rolls pointed at their own
// gender (E2E-verified deadlock: ~25-44% of mixed-gender sessions). After a
// candidate has waited GENDER_RELAX_MS the preference is dropped, and a
// sweeper re-scans stale queue entries so stuck users always pair eventually
// (the "widen the pool after a wait threshold" behaviour from the plan).
const GENDER_RELAX_MS = Number(process.env.MATCH_GENDER_RELAX_MS || 10_000);
const QUEUE_SWEEP_INTERVAL_MS = Number(process.env.MATCH_QUEUE_SWEEP_MS || 5_000);
const QUEUE_SWEEP_MIN_AGE_MS = 5_000;

type PairOutcome = 'paired' | 'skip' | 'fail';

/**
 * Try to pair `me` with one specific waiting candidate. Shared by the
 * start_matching scan and the queue sweeper so both follow identical rules
 * (atomic claim, blocklist, gender grace, peer fetch, match creation,
 * match_found emits to BOTH nodes via the adapter).
 */
async function tryPairWith(
  io: Server,
  me: { userId: string; socketId: string; targetGender: string | null; filters?: any },
  candidateId: string,
  candidate: QueueEntry,
): Promise<PairOutcome> {
  if (candidateId === me.userId) return 'skip';

  // Re-check after listQueue: the candidate may have cancelled/disconnected
  // since the snapshot was taken (claims alone would pair a gone user).
  const fresh = await store().getQueueEntry(candidateId);
  if (!fresh) return 'skip';

  // Atomic both-or-nothing claim (Lua in Redis): no two scanners can pair
  // the same candidate.
  if (!(await store().claimUsers(candidateId, me.userId))) return 'skip';

  try {
    if (await isBlocked(me.userId, candidateId)) return 'skip';

    if (me.targetGender) {
      // Grace: ignore the preference once the candidate has waited long
      // enough — a slightly less-biased match beats an infinite queue.
      const waited = Date.now() - (candidate.joinedAt ?? Date.now());
      if (waited < GENDER_RELAX_MS) {
        const peerUser = await prisma.user.findUnique({
          where: { id: candidateId },
          select: { gender: true },
        });
        if (peerUser && peerUser.gender !== me.targetGender) return 'skip';
      }
    }

    await store().leaveQueue(candidateId);
    await store().leaveQueue(me.userId);

    const [peer1, peer2] = await Promise.all([
      prisma.user.findUnique({
        where: { id: candidateId },
        select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, status: true, isVerified: true, isPremium: true },
      }),
      prisma.user.findUnique({
        where: { id: me.userId },
        select: { id: true, username: true, displayName: true, age: true, country: true, interests: true, profilePicture: true, gender: true, status: true, isVerified: true, isPremium: true },
      }),
    ]);

    if (!peer1 || !peer2) {
      // Put BOTH users back — the old code silently dropped the candidate.
      await store().joinQueue(candidateId, candidate);
      await store().joinQueue(me.userId, {
        socketId: me.socketId,
        filters: me.filters,
        joinedAt: Date.now(),
      });
      return 'fail';
    }

    const peer1Interests: string[] = JSON.parse(peer1.interests || '[]');
    const peer2Interests: string[] = JSON.parse(peer2.interests || '[]');
    const mutual = peer1Interests.filter((i: string) => peer2Interests.includes(i));

    const match = await prisma.match.create({
      data: {
        user1Id: candidateId,
        user2Id: me.userId,
        status: 'ACTIVE',
        mutualInterests: JSON.stringify(mutual),
      },
    });

    // Handshake window over — release the claims (never released after a
    // match in the original code, which permanently broke matching after one
    // completed/skipped match).
    await store().releaseUsers(candidateId, me.userId);
    await store().addMatch({ user1: candidateId, user2: me.userId, matchId: match.id, startTime: Date.now() });

    io.to(candidate.socketId).emit('match_found', {
      matchId: match.id,
      isInitiator: match.user1Id === candidateId,
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
    io.to(me.socketId).emit('match_found', {
      matchId: match.id,
      isInitiator: match.user1Id === me.userId,
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

    return 'paired';
  } catch (err) {
    console.error('pairing error:', err);
    return 'fail';
  } finally {
    // Release claims only when still held (paired/fail paths already
    // released/kept them appropriately — release is idempotent either way,
    // but a 'skip' must release so the candidate stays claimable).
    await store().releaseUsers(candidateId, me.userId);
  }
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
  activeIo = io;

  // Wire moderation hooks: locking an account now force-disconnects every
  // live socket for that user and purges them from queues/pending calls
  // (M11) instead of letting them keep matching until a natural reconnect.
  setRealtimeHooks({
    kickUser: (userId: string, reason: string) => {
      // Async work: failures must not break the caller (lockAccount).
      void (async () => {
        // Purge matchmaking state first so no new match can be created.
        await store().leaveQueue(userId);
        await store().releaseUsers(userId);

        // Cancel pending direct calls involving the user (either role).
        for (const callId of await store().pendingCallIdsFor(userId)) {
          const pending = await store().deletePendingCall(callId);
          if (!pending) continue;
          const timer = pendingCallTimers.get(callId);
          if (timer) clearTimeout(timer);
          pendingCallTimers.delete(callId);
          const otherId = pending.callerId === userId ? pending.calleeId : pending.callerId;
          if (pending.callerId === userId) {
            io.to(`user_${otherId}`).emit('call_cancelled', { callId });
          } else {
            io.to(`user_${otherId}`).emit('call_declined', { callId });
          }
        }

        // End any active match cleanly so the peer isn't left hanging.
        for (const [matchId, match] of await store().listMatches()) {
          if (match.user1 === userId || match.user2 === userId) {
            await teardownMatch(io, matchId, 'moderation');
          }
        }

        // Force-disconnect every socket for the user ACROSS NODES — with the
        // Redis adapter `io.in(room).disconnectSockets()` reaches sockets on
        // other nodes too (the old code could only see local sockets).
        // Each socket's own disconnect handler then runs its local cleanup.
        await io.in(`user_${userId}`).disconnectSockets(true);
      })().catch((err) => console.error('kickUser failed:', err));
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      const refreshToken = socket.handshake.auth.refreshToken as string | undefined;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      let userId: string;
      try {
        userId = app.jwt.verify<{ userId: string }>(token).userId;
      } catch (err) {
        // H7: the access token (15 min) used to be the ONLY credential the
        // socket accepted. After it expired, any reconnect failed permanently
        // ("Invalid or expired token") and realtime silently died until a full
        // page reload. Fall back to the refresh token so a reconnecting client
        // can transparently re-authenticate.
        if (!refreshToken) return next(new Error('Invalid or expired token'));
        const tokenRecord = await prisma.refreshToken.findUnique({
          where: { token: refreshToken },
        });
        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
          return next(new Error('Invalid or expired token'));
        }
        userId = tokenRecord.userId;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
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

  io.on('connection', async (socket) => {
    const authSocket = socket as SocketAuth;
    const userId = authSocket.userId!;

    console.log(`Socket connected: ${socket.id} (user: ${userId})`);

    // Join user's personal room
    socket.join(`user_${userId}`);

    // Multi-tab connection tracking — shared across nodes so node A losing
    // its last LOCAL socket no longer marks a user offline while their tab on
    // node B is still live (audit H11 sibling issue in multi-node setups).
    const { first: wasOffline } = await store().addSocket(userId, socket.id);

    // Start heartbeat timer
    resetHeartbeat(socket, userId);

    // M4: the old heartbeat wrote `lastSeen` to the DB on EVERY beat (every
    // 30s per user — ~16k writes/s at 500k users). Liveness now goes to the
    // state store (Redis O(1) set, no DB) and the DB write is throttled to at
    // most once per minute per socket.
    let lastSeenWriteAt = 0;

    // If this is the first connection, mark as ONLINE and broadcast
    if (wasOffline) {
      prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE', lastSeen: new Date() },
      }).then(async () => {
        await store().setPresence(userId, 'ONLINE', Date.now());
        broadcastPresence(io, userId, 'ONLINE', new Date());
      }).catch(err => console.error('Status update error:', err));
    }

    // ======================================
    // HEARTBEAT
    // ======================================

    socket.on('heartbeat', () => {
      resetHeartbeat(socket, userId);
      const now = Date.now();
      // Cheap liveness updates land in the state store (Redis) on every beat;
      // the Postgres write is throttled to >=1/min per socket.
      void store().touchLastSeen(userId, now);
      void store().touchConnections(userId);
      if (now - lastSeenWriteAt > 60_000) {
        lastSeenWriteAt = now;
        prisma.user.update({
          where: { id: userId },
          data: { lastSeen: new Date() },
        }).catch(() => {});
      }
      socket.emit('pong');
    });

    // ======================================
    // PRESENCE SYNC
    // ======================================

    socket.on('presence_sync', async (data: { userIds: string[] }) => {
      const ids = Array.isArray(data?.userIds) ? data.userIds.slice(0, 200) : [];
      if (!ids.length) {
        socket.emit('presence_sync_result', { users: [] });
        return;
      }
      // State store answers live presence cheaply; fall back to the DB for
      // ids the store doesn't know (never-seen / expired-but-persisted users).
      const stored = await store().getPresences(ids);
      const missing = ids.filter((id) => !stored[id]);
      const rows = missing.length
        ? await prisma.user.findMany({
            where: { id: { in: missing } },
            select: { id: true, status: true, lastSeen: true },
          })
        : [];
      const users = [
        ...ids
          .filter((id) => stored[id])
          .map((id) => ({ id, status: stored[id]!.status, lastSeen: new Date(stored[id]!.lastSeen) })),
        ...rows.map((r) => ({ id: r.id, status: r.status, lastSeen: r.lastSeen })),
      ];
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

      let targetGender: string | null = null;
      if (!isPremium && userGender) {
        const roll = Math.random();
        targetGender = roll < 0.75 ? userGender : (userGender === 'MALE' ? 'FEMALE' : 'MALE');
      }
      await store().joinQueue(userId, {
        socketId: socket.id,
        filters: isPremium ? data?.filters : undefined,
        joinedAt: Date.now(),
        targetGender,
      });
      await store().setPresence(userId, 'MATCHING', Date.now());

      const me = {
        userId,
        socketId: socket.id,
        targetGender,
        filters: isPremium ? data?.filters : undefined,
      };

      try {
        // Shared queue: candidates come from the state store, so any node can
        // pair any waiting user. tryPairWith does the atomic claim, blocklist,
        // gender-grace check and match creation atomically.
        for (const [waitingUserId, waitingData] of await store().listQueue()) {
          const outcome = await tryPairWith(io, me, waitingUserId, waitingData);
          if (outcome === 'paired') return;
          if (outcome === 'fail') break; // requeued inside; stop this pass
          // 'skip' -> keep scanning the next candidate
        }
      } catch (err) {
        // Any mid-handshake failure (e.g. DB error) must not leave stale
        // claims or drop the user on the floor: release and re-queue. Claims
        // are TTL-capped in Redis, so even a crashed node can't poison users.
        console.error('start_matching error:', err);
        await store().releaseUsers(userId);
        await store().joinQueue(userId, { ...me, joinedAt: Date.now() });
        socket.emit('error', { message: 'Matchmaking error. Please try again.' });
        return;
      }

      socket.emit('matching_queue', { queuePosition: await store().queueSize(), status: 'waiting' });
    });

    socket.on('cancel_matching', async () => {
      await store().leaveQueue(userId);
      await store().releaseUsers(userId);

      // H10: don't clobber status when the user is actually inside an active
      // match (multi-tab / raced events used to flip them ONLINE mid-call).
      if (!(await isUserInMatch(userId))) {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'ONLINE' },
        });
        await store().setPresence(userId, 'ONLINE', Date.now());
      }

      socket.emit('matching_cancelled');
    });

    // ======================================
    // WebRTC SIGNALING
    // ======================================

    socket.on('webrtc_offer', async (data: { matchId: string; offer: any }) => {
      const match = await store().getMatch(data.matchId);
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

    socket.on('webrtc_answer', async (data: { matchId: string; answer: any }) => {
      const match = await store().getMatch(data.matchId);
      if (!match) return;

      const otherUserId = getPeerId(match, userId);
      io.to(`user_${otherUserId}`).emit('webrtc_answer', {
        answer: data.answer,
        fromUserId: userId,
      });
    });

    socket.on('webrtc_candidate', async (data: { matchId: string; candidate: any }) => {
      const match = await store().getMatch(data.matchId);
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
      if (await isUserInMatch(userId)) {
        socket.emit('call_error', { message: 'You are already in a call' });
        return;
      }
      // The callee is busy if they're already in a match.
      if (await isUserInMatch(friendId)) {
        socket.emit('call_error', { message: 'User is busy in another call' });
        return;
      }
      // Cross-node liveness check (was a node-local Map lookup).
      if (!(await store().hasSockets(friendId))) {
        socket.emit('call_error', { message: 'User is offline' });
        return;
      }

      // Cancel any random-matching queue so the user doesn't get paired while
      // their direct call is ringing.
      if (await store().getQueueEntry(userId)) {
        await store().leaveQueue(userId);
        await store().releaseUsers(userId);
        socket.emit('matching_cancelled');
      }

      const callId = uuidv4();
      // Atomic create: the store rejects when EITHER party already has a
      // pending call — replacing the old O(n) scans over all pending calls.
      const created = await store().createPendingCall(
        callId,
        { callerId: userId, calleeId: friendId },
        12,
      );
      if (!created.created) {
        socket.emit('call_error', {
          message: created.busyRole === 'callee' ? 'User is busy in another call' : 'You already have a call in progress',
        });
        return;
      }

      // Auto-expire the pending call if neither side acts on it (~12s is a
      // standard unanswered-call window). The timer lives on the creating
      // node; the store's TTL is the crash-safety net. deletePendingCall is an
      // atomic take, so a timeout can't race an accept — only one wins.
      const callTimeout = setTimeout(() => {
        void store().deletePendingCall(callId).then((gone) => {
          pendingCallTimers.delete(callId);
          if (!gone) return; // accepted/declined/cancelled already
          socket.emit('call_error', { message: 'Call timed out', code: 'CALL_TIMEOUT' });
          io.to(`user_${friendId}`).emit('call_cancelled', { callId });
        });
      }, 12000);
      pendingCallTimers.set(callId, callTimeout);

      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, profilePicture: true },
      });

      // Let the caller track this call (for the "calling..." UI + cancel).
      socket.emit('call_initiated', { callId, calleeId: friendId });

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
      const pending = data?.callId ? await store().getPendingCall(data.callId) : null;
      if (!pending || pending.calleeId !== userId) {
        socket.emit('call_error', { message: 'Call is no longer available' });
        return;
      }
      // Atomic take — if the caller cancelled/timeout fired a millisecond
      // ago, delete returns null and we bail instead of half-accepting.
      const taken = await store().deletePendingCall(data.callId);
      if (!taken) {
        socket.emit('call_error', { message: 'Call is no longer available' });
        return;
      }
      const timer = pendingCallTimers.get(data.callId);
      if (timer) { clearTimeout(timer); pendingCallTimers.delete(data.callId); }

      // Reuse an existing conversation (ENDED match) between these two friends
      // instead of always creating a new one — otherwise every call spawns a
      // duplicate thread with the same user. Only create a fresh match when
      // none exists yet.
      let match = await prisma.match.findFirst({
        where: {
          OR: [
            { user1Id: pending.callerId, user2Id: pending.calleeId },
            { user1Id: pending.calleeId, user2Id: pending.callerId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!match) {
        match = await prisma.match.create({
          data: {
            user1Id: pending.callerId,
            user2Id: pending.calleeId,
            status: 'ACTIVE',
          },
        });
      } else {
        // Reactivate the reused conversation for the duration of the call.
        match = await prisma.match.update({
          where: { id: match.id },
          data: { status: 'ACTIVE' },
        });
      }
      await store().addMatch({
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

    socket.on('decline_call', async (data: { callId: string }) => {
      const pending = data?.callId ? await store().getPendingCall(data.callId) : null;
      if (!pending) return;
      if (pending.calleeId !== userId && pending.callerId !== userId) return;
      const taken = await store().deletePendingCall(data.callId);
      const timer = pendingCallTimers.get(data.callId);
      if (timer) { clearTimeout(timer); pendingCallTimers.delete(data.callId); }
      if (!taken) return;
      io.to(`user_${pending.callerId}`).emit('call_declined', { callId: data.callId });
    });

    socket.on('cancel_call', async (data: { callId: string }) => {
      const pending = data?.callId ? await store().getPendingCall(data.callId) : null;
      if (!pending) return;
      if (pending.callerId !== userId) return;
      const taken = await store().deletePendingCall(data.callId);
      const timer = pendingCallTimers.get(data.callId);
      if (timer) { clearTimeout(timer); pendingCallTimers.delete(data.callId); }
      if (!taken) return;
      io.to(`user_${pending.calleeId}`).emit('call_cancelled', { callId: data.callId });
    });

    // End an ACTIVE direct (friend) call and tear down its match, mirroring the
    // end_match logic. The widget tracks the matchId locally and emits this on
    // hang-up — otherwise the activeMatches entry leaks and the next call fails
    // with "You are already in a call".
    socket.on('end_direct_call', async (data: { matchId: string }) => {
      const match = await store().deleteMatch(data.matchId);
      if (!match) return;

      const duration = Math.floor((Date.now() - match.startTime) / 1000);

      await prisma.match.update({
        where: { id: data.matchId },
        data: { status: 'ENDED', endTime: new Date(), duration },
      });

      const otherUserId = getPeerId(match, userId);
      await store().releaseUsers(userId, otherUserId);

      await Promise.all([
        prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
        prisma.user.update({ where: { id: otherUserId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
      ]);

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
    // IN-MATCH CHAT
    // ======================================

    socket.on('send_match_message', async (data: { matchId: string; content: string; type?: string }) => {
      const match = await store().getMatch(data.matchId);
      if (!match) return;

      // M1: the socket path previously accepted ANY content/type unvalidated
      // (the REST schema existed but was unused here) — up to Socket.IO's 1MB
      // buffer per message. Validate with the shared schema and rate-limit.
      const parsed = SendMessageSchema.safeParse({
        matchId: data?.matchId,
        content: data?.content,
        type: data?.type || 'TEXT',
      });
      if (!parsed.success) {
        socket.emit('error', { message: 'Invalid message' });
        return;
      }
      if (!hit(`match_msg:${userId}`, 30, 10_000)) {
        socket.emit('error', { message: 'You are sending messages too fast' });
        return;
      }

      try {
        const otherUserId = getPeerId(match, userId);

        const message = await prisma.message.create({
          data: {
            matchId: parsed.data.matchId,
            senderId: userId,
            receiverId: otherUserId,
            content: parsed.data.content,
            type: parsed.data.type as any,
          },
        });

        io.to(`user_${otherUserId}`).emit('match_message', message);
        socket.emit('match_message_sent', message);
      } catch (err) {
        console.error('Message error:', err);
      }
    });

    let lastTypingAt = 0;
    socket.on('typing', async (data: { matchId: string; isTyping: boolean }) => {
      // M3: typing fires frequently; throttle per socket so a chatty client
      // can't amplify into a DB query storm (the REST-conversation fallback
      // below hits the database).
      const now = Date.now();
      if (now - lastTypingAt < 400) return;
      lastTypingAt = now;

      let otherUserId: string | undefined;

      const match = await store().getMatch(data.matchId);
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
      const match = await store().deleteMatch(data.matchId);
      if (!match) return;

      await prisma.match.update({
        where: { id: data.matchId },
        data: { status: 'SKIPPED', endTime: new Date() },
      });

      const otherUserId = getPeerId(match, userId);
      await store().releaseUsers(userId, otherUserId);
      // H10: skipping used to leave both users' status stuck at MATCHING.
      await Promise.all([
        prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE' } }).catch(() => {}),
        prisma.user.update({ where: { id: otherUserId }, data: { status: 'ONLINE' } }).catch(() => {}),
      ]);
      await store().setPresence(userId, 'ONLINE', Date.now());
      await store().setPresence(otherUserId, 'ONLINE', Date.now());

      io.to(`user_${otherUserId}`).emit('match_skipped', { matchId: data.matchId });
      socket.emit('match_ended', { matchId: data.matchId, reason: 'skipped' });
    });

    socket.on('end_match', async (data: { matchId: string }) => {
      const match = await store().deleteMatch(data.matchId);
      if (!match) return;

      const duration = Math.floor((Date.now() - match.startTime) / 1000);

      await prisma.match.update({
        where: { id: data.matchId },
        data: { status: 'ENDED', endTime: new Date(), duration },
      });

      const otherUserId = getPeerId(match, userId);
      await store().releaseUsers(userId, otherUserId);

      await Promise.all([
        prisma.user.update({ where: { id: userId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
        prisma.user.update({ where: { id: otherUserId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
      ]);
      await store().setPresence(userId, 'ONLINE', Date.now());
      await store().setPresence(otherUserId, 'ONLINE', Date.now());

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

      // Remove from waiting pool — but ONLY if THIS socket is the one that
      // queued the user (H11). Previously any secondary tab closing silently
      // un-queued the still-connected primary tab, which then never matched.
      const queued = await store().getQueueEntry(userId);
      if (queued && queued.socketId === socket.id) {
        await store().leaveQueue(userId);
      }
      await store().releaseUsers(userId);

      // Cross-node multi-tab: only go OFFLINE / cancel calls when this was
      // the user's LAST socket ANYWHERE (the registry lives in the store, so
      // tabs spread across nodes count correctly).
      const { last: isLastConnection } = await store().removeSocket(userId, socket.id);
      if (isLastConnection) {
        for (const callId of await store().pendingCallIdsFor(userId)) {
          const pending = await store().deletePendingCall(callId);
          if (!pending) continue;
          const timer = pendingCallTimers.get(callId);
          if (timer) clearTimeout(timer);
          pendingCallTimers.delete(callId);
          const otherId = pending.callerId === userId ? pending.calleeId : pending.callerId;
          if (pending.callerId === userId) {
            io.to(`user_${otherId}`).emit('call_cancelled', { callId });
          } else {
            io.to(`user_${otherId}`).emit('call_declined', { callId });
          }
        }

        const now = new Date();
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'OFFLINE', lastSeen: now },
        }).catch(() => {});
        await store().setPresence(userId, 'OFFLINE', now.getTime());
        broadcastPresence(io, userId, 'OFFLINE', now);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Queue sweeper — rescans stale entries so nobody waits forever.
  // Fixes the E2E-verified deadlock where only the JOINING user's gender roll
  // was ever checked and the queue was never rescanned: mixed-gender pairs
  // (and vanished peers) now pair within ~QUEUE_SWEEP + GENDER_RELAX ms.
  // ---------------------------------------------------------------------
  async function sweepQueue(): Promise<void> {
    try {
      const entries = await store().listQueue();
      const now = Date.now();
      for (const [waitingUserId, waitingData] of entries) {
        const age = now - (waitingData.joinedAt ?? 0);
        if (age < QUEUE_SWEEP_MIN_AGE_MS) continue;
        // Dead entries (clean disconnect removes them; this catches the rest
        // via the store's socket leases).
        if (!(await store().hasSockets(waitingUserId))) {
          await store().leaveQueue(waitingUserId);
          continue;
        }
        const me = {
          userId: waitingUserId,
          socketId: waitingData.socketId,
          targetGender: waitingData.targetGender ?? null,
          filters: waitingData.filters,
        };
        for (const [otherId, otherEntry] of entries) {
          if (otherId === waitingUserId) continue;
          if (now - (otherEntry.joinedAt ?? 0) < QUEUE_SWEEP_MIN_AGE_MS) continue;
          const outcome = await tryPairWith(io, me, otherId, otherEntry);
          if (outcome === 'paired' || outcome === 'fail') break;
        }
      }
    } catch (err) {
      console.error('queue sweep error:', err);
    }
  }

  const queueSweeper = setInterval(() => void sweepQueue(), QUEUE_SWEEP_INTERVAL_MS);
  queueSweeper.unref?.();
}