import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser, AuthUser } from '../middleware/auth';
import { recordAudit } from '../lib/audit';
import { adjustCoins } from '../lib/coins';
import { lockAccount, unlockAccount } from '../lib/moderation';
import { NotificationService } from '../lib/notifications';
import { withRealCounts } from '../lib/user';
import { grantPremium, revokePremium, resolvePlan } from './premium';

function requireAdmin(user: AuthUser | undefined): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
}

// ADMIN-only endpoints (role changes, economy grants, pricing, broadcast,
// system settings, audit). MODERATOR is restricted to moderation tooling.
function requireSuperAdmin(user: AuthUser | undefined): boolean {
  return user?.role === 'ADMIN';
}

function forbid(reply: any, msg = 'Admin access required'): any {
  reply.status(403);
  return { error: msg };
}

export default async function adminRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------
  app.get('/users', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);

    const { page = '1', limit = '50', search = '', role = '', status = '', verified = '' } =
      req.query as { page?: string; limit?: string; search?: string; role?: string; status?: string; verified?: string };
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { username: { contains: search } },
        { displayName: { contains: search } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;
    if (verified === 'true') where.isVerified = true;
    if (verified === 'false') where.isVerified = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: Number(limit),
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, displayName: true,
          isVerified: true, isPremium: true, status: true, trustScore: true,
          isLocked: true, createdAt: true, role: true, coins: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page: Number(page), limit: Number(limit) };
  });

  app.get('/users/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        privacySettings: true,
        preferences: true,
      },
    });
    if (!user) { reply.status(404); return { error: 'User not found' }; }

    return { user: await withRealCounts(id, user) };
  });

  app.put('/users/:id/role', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can change roles');
    const { id } = req.params as { id: string };
    const { role } = req.body as { role: 'USER' | 'ADMIN' | 'MODERATOR' };

    const user = await prisma.user.update({ where: { id }, data: { role }, select: { id: true, username: true, role: true } });
    await recordAudit(authUser, 'USER_ROLE', 'USER', id, { role });
    return { user };
  });

  app.put('/users/:id/verify', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const { isVerified } = req.body as { isVerified: boolean };

    const user = await prisma.user.update({ where: { id }, data: { isVerified }, select: { id: true, username: true, isVerified: true } });
    await recordAudit(authUser, 'USER_VERIFY', 'USER', id, { isVerified });
    return { user };
  });

  app.put('/users/:id/lock', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };

    await lockAccount(id, reason || 'Locked by moderator');
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, isLocked: true } });
    await recordAudit(authUser, 'USER_LOCK', 'USER', id, { reason });
    return { user };
  });

  app.put('/users/:id/unlock', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };

    await unlockAccount(id);
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, isLocked: true } });
    await recordAudit(authUser, 'USER_UNLOCK', 'USER', id);
    return { user };
  });

  app.put('/users/:id/trust', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const { trustScore } = req.body as { trustScore: number };

    const score = Math.max(0, Math.min(100, Math.round(trustScore)));
    const user = await prisma.user.update({ where: { id }, data: { trustScore: score }, select: { id: true, username: true, trustScore: true } });
    await recordAudit(authUser, 'USER_TRUST', 'USER', id, { trustScore: score });
    return { user };
  });

  app.put('/users/:id/coins', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can adjust coins');
    const { id } = req.params as { id: string };
    const { amount, reason } = req.body as { amount: number; reason?: string };

    if (!Number.isFinite(amount)) { reply.status(400); return { error: 'amount must be a number' }; }
    try {
      const balance = await adjustCoins(id, amount, 'ADMIN', reason);
      await recordAudit(authUser, 'USER_COINS', 'USER', id, { amount, reason, balance });
      return { balance };
    } catch (err: any) {
      reply.status(err.statusCode || 400);
      return { error: err.message };
    }
  });

  app.put('/users/:id/premium', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can manage premium');
    const { id } = req.params as { id: string };
    const { grant, planId, period = 'monthly' } = req.body as { grant: boolean; planId?: string; period?: string };

    if (grant) {
      const plan = resolvePlan(planId) || resolvePlan('gold')!;
      await grantPremium(id, plan, period);
      await recordAudit(authUser, 'USER_PREMIUM_GRANT', 'USER', id, { planId: plan.id, period });
    } else {
      await revokePremium(id);
      await recordAudit(authUser, 'USER_PREMIUM_REVOKE', 'USER', id);
    }
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, isPremium: true } });
    return { user };
  });

  app.put('/users/:id/boost', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can boost profiles');
    const { id } = req.params as { id: string };
    const { hours } = req.body as { hours: number };

    const boostedUntil = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
    await prisma.user.update({ where: { id }, data: { boostedUntil } });
    await recordAudit(authUser, 'USER_BOOST', 'USER', id, { hours });
    return { boostedUntil };
  });

  app.get('/users/:id/achievements', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const achievements = await prisma.userAchievement.findMany({ where: { userId: id } });
    return { achievements };
  });

  app.post('/users/:id/achievements', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can grant achievements');
    const { id } = req.params as { id: string };
    const { name, description, icon, maxProgress } = req.body as { name: string; description?: string; icon?: string; maxProgress?: number };

    const ach = await prisma.userAchievement.upsert({
      where: { userId_name: { userId: id, name } },
      update: { unlocked: true, unlockedAt: new Date() },
      create: { userId: id, name, description: description || name, icon: icon || 'emoji_events', maxProgress: maxProgress || 1, progress: maxProgress || 1, unlocked: true, unlockedAt: new Date() },
    });
    await recordAudit(authUser, 'USER_ACHIEVEMENT_GRANT', 'USER', id, { name });
    return { achievement: ach };
  });

  app.delete('/users/:id/achievements/:name', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can revoke achievements');
    const { id, name } = req.params as { id: string; name: string };

    await prisma.userAchievement.deleteMany({ where: { userId: id, name } });
    await recordAudit(authUser, 'USER_ACHIEVEMENT_REVOKE', 'USER', id, { name });
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Sessions / Security
  // ---------------------------------------------------------------------------
  app.get('/users/:id/sessions', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const sessions = await prisma.refreshToken.findMany({ where: { userId: id }, orderBy: { expiresAt: 'desc' } });
    return { sessions };
  });

  app.delete('/users/:id/sessions', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await recordAudit(authUser, 'USER_SESSIONS_REVOKE_ALL', 'USER', id);
    return { success: true };
  });

  app.delete('/users/:id/sessions/:tokenId', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id, tokenId } = req.params as { id: string; tokenId: string };
    await prisma.refreshToken.deleteMany({ where: { id: tokenId, userId: id } });
    await recordAudit(authUser, 'USER_SESSION_REVOKE', 'USER', id, { tokenId });
    return { success: true };
  });

  app.get('/users/:id/login-history', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const history = await prisma.loginHistory.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { history };
  });

  // ---------------------------------------------------------------------------
  // Reports / Moderation
  // ---------------------------------------------------------------------------
  app.get('/reports', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { status = '', page = '1', limit = '50' } = req.query as { status?: string; page?: string; limit?: string };
    const where: any = {};
    if (status) where.status = status;
    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: { reporter: { select: { id: true, username: true } }, reportedUser: { select: { id: true, username: true, trustScore: true, isLocked: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.report.count({ where }),
    ]);
    return { reports, total, page: Number(page), limit: Number(limit) };
  });

  app.get('/reports/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const report = await prisma.report.findUnique({
      where: { id },
      include: { reporter: { select: { id: true, username: true } }, reportedUser: { select: { id: true, username: true, trustScore: true, isLocked: true, isPremium: true, createdAt: true } } },
    });
    if (!report) { reply.status(404); return { error: 'Report not found' }; }
    return { report };
  });

  app.post('/reports/:id/review', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const report = await prisma.report.update({ where: { id }, data: { status: 'REVIEWED' } });
    await recordAudit(authUser, 'REPORT_REVIEW', 'REPORT', id);
    return { report };
  });

  app.post('/reports/:id/resolve', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const report = await prisma.report.update({ where: { id }, data: { status: 'RESOLVED' } });
    await recordAudit(authUser, 'REPORT_RESOLVE', 'REPORT', id);
    return { report };
  });

  app.post('/reports/:id/dismiss', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const report = await prisma.report.update({ where: { id }, data: { status: 'DISMISSED' } });
    await recordAudit(authUser, 'REPORT_DISMISS', 'REPORT', id);
    return { report };
  });

  app.post('/reports/:id/action', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const { action } = req.body as { action: string };

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) { reply.status(404); return { error: 'Report not found' }; }

    if (action === 'LOCK') {
      await lockAccount(report.reportedUserId, `Auto-locked from report ${id}`);
      await prisma.report.update({ where: { id }, data: { status: 'RESOLVED' } });
      await recordAudit(authUser, 'REPORT_ACTION_LOCK', 'REPORT', id, { reportedUserId: report.reportedUserId });
      return { success: true, locked: report.reportedUserId };
    }
    reply.status(400);
    return { error: 'Unknown action' };
  });

  // ---------------------------------------------------------------------------
  // Content (messages + matches)
  // ---------------------------------------------------------------------------
  app.get('/messages', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId = '', matchId = '', page = '1', limit = '50' } = req.query as { userId?: string; matchId?: string; page?: string; limit?: string };
    const where: any = {};
    if (userId) where.OR = [{ senderId: userId }, { receiverId: userId }];
    if (matchId) where.matchId = matchId;
    const skip = (Number(page) - 1) * Number(limit);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, username: true } }, receiver: { select: { id: true, username: true } } } }),
      prisma.message.count({ where }),
    ]);
    return { messages, total, page: Number(page), limit: Number(limit) };
  });

  app.delete('/messages/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.message.update({ where: { id }, data: { deleted: true } });
    await recordAudit(authUser, 'MESSAGE_DELETE', 'MESSAGE', id);
    return { success: true };
  });

  app.get('/matches', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);
    const [matches, total] = await Promise.all([
      prisma.match.findMany({ skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { user1: { select: { id: true, username: true } }, user2: { select: { id: true, username: true } } } }),
      prisma.match.count(),
    ]);
    return { matches, total, page: Number(page), limit: Number(limit) };
  });

  app.post('/matches/:id/end', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    const match = await prisma.match.update({ where: { id }, data: { status: 'ENDED', endTime: new Date() } });
    await prisma.user.updateMany({ where: { id: { in: [match.user1Id, match.user2Id] } }, data: { status: 'ONLINE' } });
    await recordAudit(authUser, 'MATCH_END', 'MATCH', id);
    return { match };
  });

  app.delete('/matches/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.match.delete({ where: { id } });
    await recordAudit(authUser, 'MATCH_DELETE', 'MATCH', id);
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Social graph
  // ---------------------------------------------------------------------------
  app.get('/friends', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId = '', page = '1', limit = '50' } = req.query as { userId?: string; page?: string; limit?: string };
    const where: any = {};
    if (userId) where.OR = [{ senderId: userId }, { receiverId: userId }];
    const skip = (Number(page) - 1) * Number(limit);

    const [friends, total] = await Promise.all([
      prisma.friend.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, username: true } }, receiver: { select: { id: true, username: true } } } }),
      prisma.friend.count({ where }),
    ]);
    return { friends, total, page: Number(page), limit: Number(limit) };
  });

  app.delete('/friends/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.friend.delete({ where: { id } });
    await recordAudit(authUser, 'FRIEND_REMOVE', 'FRIEND', id);
    return { success: true };
  });

  app.get('/friend-requests', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { status = '', page = '1', limit = '50' } = req.query as { status?: string; page?: string; limit?: string };
    const where: any = {};
    if (status) where.status = status;
    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      prisma.friendRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit), include: { fromUser: { select: { id: true, username: true } }, toUser: { select: { id: true, username: true } } } }),
      prisma.friendRequest.count({ where }),
    ]);
    return { requests, total, page: Number(page), limit: Number(limit) };
  });

  app.delete('/friend-requests/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.friendRequest.delete({ where: { id } });
    await recordAudit(authUser, 'FRIEND_REQUEST_CANCEL', 'FRIEND_REQUEST', id);
    return { success: true };
  });

  app.get('/blocks', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);
    const [blocks, total] = await Promise.all([
      prisma.blockedUser.findMany({ orderBy: { createdAt: 'desc' }, skip, take: Number(limit), include: { user: { select: { id: true, username: true } } } }),
      prisma.blockedUser.count(),
    ]);
    return { blocks, total, page: Number(page), limit: Number(limit) };
  });

  app.delete('/blocks/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.blockedUser.delete({ where: { id } });
    await recordAudit(authUser, 'BLOCK_REMOVE', 'BLOCKED_USER', id);
    return { success: true };
  });

  app.get('/profile-views', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId = '' } = req.query as { userId?: string };
    const where: any = {};
    if (userId) where.OR = [{ viewerId: userId }, { viewedUserId: userId }];
    const views = await prisma.profileView.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { viewer: { select: { id: true, username: true } }, viewedUser: { select: { id: true, username: true } } } });
    return { views };
  });

  // ---------------------------------------------------------------------------
  // Premium / Billing
  // ---------------------------------------------------------------------------
  app.get('/subscriptions', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can list all subscriptions');
    const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);
    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({ skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, username: true, isPremium: true } } } }),
      prisma.subscription.count(),
    ]);
    return { subscriptions, total, page: Number(page), limit: Number(limit) };
  });

  app.get('/subscriptions/:userId', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId } = req.params as { userId: string };
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    return { subscription };
  });

  app.put('/subscriptions/:userId', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can edit subscriptions');
    const { userId } = req.params as { userId: string };
    const { endDate, isActive } = req.body as { endDate?: string; isActive?: boolean };

    const data: any = {};
    if (endDate) data.endDate = new Date(endDate);
    if (typeof isActive === 'boolean') data.isActive = isActive;
    const subscription = await prisma.subscription.update({ where: { userId }, data });
    if (typeof isActive === 'boolean') await prisma.user.update({ where: { id: userId }, data: { isPremium: isActive } });
    await recordAudit(authUser, 'SUBSCRIPTION_EDIT', 'SUBSCRIPTION', userId, { endDate, isActive });
    return { subscription };
  });

  // ---------------------------------------------------------------------------
  // Coin packages (pricing config) — ADMIN only
  // ---------------------------------------------------------------------------
  app.get('/coin-packages', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const packages = await prisma.coinPackage.findMany({ orderBy: { priceUsd: 'asc' } });
    return { packages };
  });

  app.post('/coin-packages', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can manage coin packages');
    const { id, name, coins, priceUsd, bonus, popular } = req.body as { id: string; name: string; coins: number; priceUsd: number; bonus?: number; popular?: boolean };
    const pkg = await prisma.coinPackage.create({ data: { id, name, coins, priceUsd, bonus: bonus || 0, popular: popular || false } });
    await recordAudit(authUser, 'COIN_PACKAGE_CREATE', 'COIN_PACKAGE', id);
    return { package: pkg };
  });

  app.put('/coin-packages/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can manage coin packages');
    const { id } = req.params as { id: string };
    const { name, coins, priceUsd, bonus, popular } = req.body as { name?: string; coins?: number; priceUsd?: number; bonus?: number; popular?: boolean };
    const pkg = await prisma.coinPackage.update({ where: { id }, data: { name, coins, priceUsd, bonus, popular } });
    await recordAudit(authUser, 'COIN_PACKAGE_UPDATE', 'COIN_PACKAGE', id);
    return { package: pkg };
  });

  app.delete('/coin-packages/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can manage coin packages');
    const { id } = req.params as { id: string };
    await prisma.coinPackage.delete({ where: { id } });
    await recordAudit(authUser, 'COIN_PACKAGE_DELETE', 'COIN_PACKAGE', id);
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Coin economy
  // ---------------------------------------------------------------------------
  app.get('/coin-transactions', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId = '', page = '1', limit = '50' } = req.query as { userId?: string; page?: string; limit?: string };
    const where: any = {};
    if (userId) where.userId = userId;
    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      prisma.coinTransaction.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, username: true } } } }),
      prisma.coinTransaction.count({ where }),
    ]);
    return { transactions, total, page: Number(page), limit: Number(limit) };
  });

  app.post('/coin-transactions/adjust', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can adjust coins');
    const { userId, amount, reason } = req.body as { userId: string; amount: number; reason?: string };
    if (!Number.isFinite(amount)) { reply.status(400); return { error: 'amount must be a number' }; }
    try {
      const balance = await adjustCoins(userId, amount, 'ADMIN', reason);
      await recordAudit(authUser, 'COIN_ADJUST', 'USER', userId, { amount, reason, balance });
      return { balance };
    } catch (err: any) {
      reply.status(err.statusCode || 400);
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // Notifications / Broadcast
  // ---------------------------------------------------------------------------
  app.get('/notifications', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { userId = '', page = '1', limit = '50' } = req.query as { userId?: string; page?: string; limit?: string };
    const where: any = {};
    if (userId) where.userId = userId;
    const skip = (Number(page) - 1) * Number(limit);
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total, page: Number(page), limit: Number(limit) };
  });

  app.delete('/notifications/:id', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);
    const { id } = req.params as { id: string };
    await prisma.notification.delete({ where: { id } });
    await recordAudit(authUser, 'NOTIFICATION_DELETE', 'NOTIFICATION', id);
    return { success: true };
  });

  app.post('/notifications/broadcast', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can broadcast');
    const { title, message, type = 'ADMIN', segment } = req.body as { title: string; message: string; type?: string; segment?: string };

    const io = (req as any).server.io;
    if (io) io.emit('admin_broadcast', { title, message, type });

    await recordAudit(authUser, 'BROADCAST', undefined, undefined, { title, segment });
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // System settings — ADMIN only
  // ---------------------------------------------------------------------------
  app.get('/settings', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can view system settings');
    const settings = await prisma.systemSetting.findMany();
    return { settings };
  });

  app.put('/settings', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can change system settings');
    const { settings } = req.body as { settings: { key: string; value: string }[] };
    if (!Array.isArray(settings)) { reply.status(400); return { error: 'settings array required' }; }

    for (const s of settings) {
      await prisma.systemSetting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
    }
    await recordAudit(authUser, 'SYSTEM_SETTINGS', undefined, undefined, { keys: settings.map(s => s.key) });
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Audit log — ADMIN only
  // ---------------------------------------------------------------------------
  app.get('/audit-log', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireSuperAdmin(authUser)) return forbid(reply, 'Only admins can view the audit log');
    const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({ skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.adminAuditLog.count(),
    ]);
    return { logs, total, page: Number(page), limit: Number(limit) };
  });

  // ---------------------------------------------------------------------------
  // Stats / Analytics
  // ---------------------------------------------------------------------------
  app.get('/stats', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) return forbid(reply);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, onlineUsers, todaySignups, totalMatches, pendingReports, premiumUsers, bannedUsers, activeMatches, totalFriends, totalMessages, totalCoins, totalSubscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ONLINE' } }),
      prisma.user.count({ where: { createdAt: { gte: since24h } } }),
      prisma.match.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.user.count({ where: { isLocked: true } }),
      prisma.match.count({ where: { status: 'ACTIVE' } }),
      prisma.friend.count(),
      prisma.message.count(),
      prisma.user.aggregate({ _sum: { coins: true } }).then(r => r._sum.coins || 0),
      prisma.subscription.count({ where: { isActive: true } }),
    ]);

    return {
      totalUsers, onlineUsers, todaySignups, totalMatches, pendingReports,
      premiumUsers, bannedUsers, activeMatches, totalFriends, totalMessages,
      totalCoins, totalSubscriptions,
    };
  });
}
