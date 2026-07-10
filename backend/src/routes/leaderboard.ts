import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';

/**
 * Leaderboards. Computed live from existing user columns (no separate table).
 * Categories: conversations, friends, reputation (trustScore), activity (dailyStreak).
 */
export default async function leaderboardRoutes(app: FastifyInstance) {
  app.get('/leaderboard', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { category = 'conversations', limit = '20' } = req.query as { category?: string; limit?: string };

    const allowed = ['conversations', 'friends', 'reputation', 'activity'];
    const cat = allowed.includes(category) ? category : 'conversations';

    const orderBy = (cat === 'conversations' ? { totalConversations: 'desc' as const }
      : cat === 'friends' ? { friendsCount: 'desc' as const }
        : cat === 'reputation' ? { trustScore: 'desc' as const }
          : { dailyStreak: 'desc' as const });

    const users = await prisma.user.findMany({
      where: { isGuest: false, id: { not: authUser.id } },
      orderBy,
      take: Number(limit),
      select: {
        id: true,
        displayName: true,
        profilePicture: true,
        isVerified: true,
        isPremium: true,
        totalConversations: true,
        friendsCount: true,
        trustScore: true,
        dailyStreak: true,
      },
    });

    const ranked = users.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      displayName: u.displayName,
      profilePicture: u.profilePicture,
      isVerified: u.isVerified,
      isPremium: u.isPremium,
      score: (u as any)[
        cat === 'conversations' ? 'totalConversations'
          : cat === 'friends' ? 'friendsCount'
            : cat === 'reputation' ? 'trustScore'
              : 'dailyStreak'
      ],
    }));

    return { category: cat, leaderboard: ranked };
  });
}
