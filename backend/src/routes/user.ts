import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { withRealCounts } from '../lib/user';
import { getFriendIds } from '../lib/relations';
import { UpdateProfileSchema, UpdatePreferencesSchema, UpdatePrivacySettingsSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';
import { adjustCoins } from '../lib/coins';

export default async function userRoutes(app: FastifyInstance) {
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        age: true,
        gender: true,
        bio: true,
        country: true,
        languages: true,
        interests: true,
        profilePicture: true,
        coverImage: true,
        isVerified: true,
        isPremium: true,
        status: true,
        trustScore: true,
        verificationLevel: true,
        communityRating: true,
        friendsCount: true,
        totalConversations: true,
        createdAt: true,
        privacySettings: true,
      },
    });
    
    if (!user) {
      reply.status(404);
      return { error: 'User not found' };
    }

    if (user.privacySettings?.privateProfile) {
      const privateUser = await withRealCounts(id, {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        privacySettings: user.privacySettings,
        isPrivate: true,
      });
      return { user: privateUser, privacySettings: user.privacySettings };
    }

    const privacy = user.privacySettings;
    const filtered: Record<string, any> = { ...user };
    if (privacy?.hideAge) filtered.age = undefined;
    if (privacy?.hideCountry) filtered.country = undefined;
    if (privacy?.hideOnlineStatus) filtered.status = undefined;
    if (privacy?.hideProfilePicture) filtered.profilePicture = undefined;
    delete filtered.privacySettings;

    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const decoded = app.jwt.verify<{ userId: string }>(authHeader.replace('Bearer ', ''));
        if (decoded.userId !== id) {
          await prisma.profileView.upsert({
            where: { viewerId_viewedUserId: { viewerId: decoded.userId, viewedUserId: id } },
            update: { createdAt: new Date() },
            create: { viewerId: decoded.userId, viewedUserId: id },
          });
        }
      } catch {}
    }

    const userWithCounts = await withRealCounts(id, filtered);
    return { user: userWithCounts, privacySettings: user.privacySettings };
  });

  app.patch('/me/profile', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const data = UpdateProfileSchema.parse(req.body);
    
    const user = await prisma.user.update({
      where: { id: authUser.id },
      data,
      select: {
        id: true,
        displayName: true,
        bio: true,
        age: true,
        gender: true,
        country: true,
        languages: true,
        interests: true,
        profilePicture: true,
        coverImage: true,
      },
    });
    
    return { user };
  });

  app.put('/me/settings', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const data = UpdatePrivacySettingsSchema.parse(req.body);
    
    const settings = await prisma.privacySettings.upsert({
      where: { userId: authUser.id },
      create: { ...data, userId: authUser.id },
      update: data,
    });
    
    return { settings };
  });

  app.put('/me/preferences', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const data = UpdatePreferencesSchema.parse(req.body);
    
    const preferences = await prisma.userPreferences.upsert({
      where: { userId: authUser.id },
      create: { ...data, userId: authUser.id },
      update: data,
    });
    
    return { preferences };
  });

  app.get('/me/settings', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    const [settings, preferences] = await Promise.all([
      prisma.privacySettings.findUnique({ where: { userId: authUser.id } }),
      prisma.userPreferences.findUnique({ where: { userId: authUser.id } }),
    ]);
    
    return { settings, preferences };
  });

  app.get('/search', async (req) => {
    const { q } = req.query as { q: string };
    
    if (!q || q.length < 2) {
      return { users: [] };
    }
    
    const users = await prisma.user.findMany({
      where: {
        isGuest: false,
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        profilePicture: true,
        country: true,
        interests: true,
        isVerified: true,
        isPremium: true,
        status: true,
      },
      take: 20,
    });
    
    return { users };
  });

  app.get('/discover', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    const users = await prisma.user.findMany({
      where: {
        id: { not: authUser.id },
        isGuest: false,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        profilePicture: true,
        country: true,
        interests: true,
        languages: true,
        age: true,
        isVerified: true,
        isPremium: true,
        status: true,
        trustScore: true,
      },
      orderBy: { trustScore: 'desc' },
      take: 24,
    });
    
    return { users };
  });

  app.get('/me/dashboard', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;

    const [user, onlineCount, trending] = await Promise.all([
      prisma.user.findUnique({
        where: { id: authUser.id },
        select: {
          coins: true,
          dailyStreak: true,
          friendsCount: true,
          totalConversations: true,
          trustScore: true,
          isPremium: true,
          achievements: true,
          displayName: true,
          profilePicture: true,
        },
      }),
      prisma.user.count({ where: { status: 'ONLINE' } }),
      prisma.user.findMany({
        where: {
          id: { not: authUser.id },
          isGuest: false,
        },
        select: {
          id: true,
          displayName: true,
          profilePicture: true,
          interests: true,
          isVerified: true,
          isPremium: true,
          country: true,
          status: true,
        },
        orderBy: { trustScore: 'desc' },
        take: 12,
      }),
    ]);

    return { stats: await withRealCounts(authUser.id, user!), onlineCount, trending };
  });

  // POST /me/daily-reward - Claim daily reward
  app.post('/me/daily-reward', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const REWARD_COINS = 10;
    const now = new Date();

    const user = await prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const lastClaim = user.lastDailyClaim;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastClaimDay = lastClaim ? new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate()) : null;

    if (lastClaimDay && lastClaimDay.getTime() === today.getTime()) {
      return reply.status(400).send({ error: 'Already claimed today' });
    }

    const isConsecutive = lastClaimDay && (today.getTime() - lastClaimDay.getTime()) === 86400000;
    const newStreak = isConsecutive ? user.dailyStreak + 1 : 1;

    const balance = await adjustCoins(authUser.id, REWARD_COINS, 'DAILY_REWARD');

    await prisma.user.update({
      where: { id: authUser.id },
      data: { dailyStreak: newStreak, lastDailyClaim: now },
    });

    return { coins: balance, dailyStreak: newStreak };
  });

  // GET /me/visitors - Profile visitors
  app.get('/me/visitors', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;

    const views = await prisma.profileView.findMany({
      where: { viewedUserId: authUser.id },
      include: {
        viewer: {
          select: {
            id: true,
            displayName: true,
            profilePicture: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { visitors: views.map(v => ({ ...v.viewer, viewedAt: v.createdAt })) };
  });

  app.get('/:id/mutual-friends', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { id: otherUserId } = req.params as { id: string };

    const userFriendIds = await getFriendIds(userId);
    const otherFriendIds = await getFriendIds(otherUserId);

    const mutualIds = userFriendIds.filter((id) => otherFriendIds.includes(id));

    const mutualFriends = await prisma.user.findMany({
      where: { id: { in: mutualIds } },
      select: {
        id: true,
        displayName: true,
        profilePicture: true,
      },
      take: 20,
    });

    return { mutualFriends, count: mutualIds.length };
  });

  // GET /:id/status - Check relationship status with another user
  app.get('/:id/status', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const userId = authUser.id;
    const { id: otherUserId } = req.params as { id: string };

    const [friendRecord, friendRequestRecord, blockedRecord] = await Promise.all([
      prisma.friend.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId },
          ],
        },
      }),
      prisma.friendRequest.findFirst({
        where: {
          OR: [
            { fromUserId: userId, toUserId: otherUserId },
            { fromUserId: otherUserId, toUserId: userId },
          ],
        },
      }),
      prisma.blockedUser.findFirst({
        where: {
          OR: [
            { userId, blockedUserId: otherUserId },
            { userId: otherUserId, blockedUserId: userId },
          ],
        },
      }),
    ]);

    let relationship: string;
    if (blockedRecord) {
      relationship = blockedRecord.userId === userId ? 'BLOCKED' : 'BLOCKED_BY';
    } else if (friendRecord) {
      relationship = 'FRIENDS';
    } else if (friendRequestRecord) {
      relationship = friendRequestRecord.fromUserId === userId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
    } else {
      relationship = 'NONE';
    }

    return { relationship, friendId: friendRecord?.id || null };
  });

  // POST /block - Block a user
  app.post('/block', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { userId: blockedUserId } = req.body as { userId: string };

    if (blockedUserId === authUser.id) {
      return reply.status(400).send({ error: 'Cannot block yourself' });
    }

    const existing = await prisma.blockedUser.findUnique({
      where: { userId_blockedUserId: { userId: authUser.id, blockedUserId } },
    });

    if (existing) {
      return reply.status(409).send({ error: 'User already blocked' });
    }

    await prisma.blockedUser.create({
      data: { userId: authUser.id, blockedUserId },
    });

    // Remove friendship if exists
    await prisma.friend.deleteMany({
      where: {
        OR: [
          { senderId: authUser.id, receiverId: blockedUserId },
          { senderId: blockedUserId, receiverId: authUser.id },
        ],
      },
    });

    return { success: true };
  });

  // DELETE /block/:id - Unblock a user
  app.delete('/block/:id', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id: blockedUserId } = req.params as { id: string };

    await prisma.blockedUser.deleteMany({
      where: { userId: authUser.id, blockedUserId },
    });

    return { success: true };
  });
}