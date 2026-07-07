import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser, AuthUser } from '../middleware/auth';

function requireAdmin(user: AuthUser | undefined): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
}

export default async function adminRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/users - List all users (admin only)
  app.get('/users', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const { page = '1', limit = '50' } = req.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          isVerified: true,
          isPremium: true,
          status: true,
          trustScore: true,
          createdAt: true,
          role: true,
        },
      }),
      prisma.user.count(),
    ]);
    
    return { users, total, page: Number(page), limit: Number(limit) };
  });

  // PUT /api/v1/admin/users/:id/role - Change user role
  app.put('/users/:id/role', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (authUser.role !== 'ADMIN') {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const { id } = req.params as { id: string };
    const { role } = req.body as { role: 'USER' | 'ADMIN' | 'MODERATOR' };
    
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, username: true, role: true },
    });
    
    return { user };
  });

  // PUT /api/v1/admin/users/:id/verify - Toggle verification
  app.put('/users/:id/verify', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const { id } = req.params as { id: string };
    const { isVerified } = req.body as { isVerified: boolean };
    
    const user = await prisma.user.update({
      where: { id },
      data: { isVerified },
      select: { id: true, username: true, isVerified: true },
    });
    
    return { user };
  });

  // GET /api/v1/admin/reports - List all reports
  app.get('/reports', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { id: true, username: true } },
        reportedUser: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return { reports };
  });

  // POST /api/v1/admin/reports/:id/review - Mark report as reviewed
  app.post('/reports/:id/review', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const { id } = req.params as { id: string };
    
    const report = await prisma.report.update({
      where: { id },
      data: { status: 'REVIEWED' },
    });
    
    return { report };
  });

  // POST /api/v1/admin/reports/:id/resolve - Resolve a report
  app.post('/reports/:id/resolve', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const { id } = req.params as { id: string };
    
    const report = await prisma.report.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
    
    return { report };
  });

  // GET /api/v1/admin/stats - Platform statistics
  app.get('/stats', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (!requireAdmin(authUser)) {
      reply.status(403);
      return { error: 'Admin access required' };
    }
    
    const [totalUsers, onlineUsers, todaySignups, totalMatches, totalReports] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ONLINE' } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.match.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
    ]);
    
    return {
      totalUsers,
      onlineUsers,
      todaySignups,
      totalMatches,
      pendingReports: totalReports,
    };
  });
}