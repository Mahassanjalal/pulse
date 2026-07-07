import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';

export default async function matchRoutes(app: FastifyInstance) {
  // POST /api/v1/matches/start - Start matching
  app.post('/start', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    await prisma.user.update({
      where: { id: authUser.id },
      data: { status: 'MATCHING' },
    });
    
    return { status: 'matching' };
  });

  // POST /api/v1/matches/cancel - Cancel matching
  app.post('/cancel', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    await prisma.user.update({
      where: { id: authUser.id },
      data: { status: 'ONLINE' },
    });
    
    return { status: 'idle' };
  });

  // POST /api/v1/matches/:id/end - End a match
  app.post('/:id/end', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const authUser = getAuthUser(req)!;
    
    const match = await prisma.match.findFirst({
      where: {
        id,
        status: 'ACTIVE',
        OR: [{ user1Id: authUser.id }, { user2Id: authUser.id }],
      },
    });
    
    if (!match) {
      return { error: 'Match not found' };
    }
    
    const duration = Math.floor((Date.now() - match.startTime.getTime()) / 1000);
    
    await prisma.match.update({
      where: { id },
      data: {
        status: 'ENDED',
        endTime: new Date(),
        duration,
      },
    });
    
    // Increment conversation count
    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        totalConversations: { increment: 1 },
        status: 'ONLINE',
      },
    });
    
    return { match: { ...match, duration } };
  });

  // GET /api/v1/matches/history
  app.get('/history', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { page = '1', limit = '20' } = req.query as { page?: string; limit?: string };
    
    const offset = (Number(page) - 1) * Number(limit);
    
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ user1Id: authUser.id }, { user2Id: authUser.id }],
      },
      include: {
        user1: { select: { id: true, displayName: true, profilePicture: true } },
        user2: { select: { id: true, displayName: true, profilePicture: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: Number(limit),
    });
    
    return { matches };
  });
}