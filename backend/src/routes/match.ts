import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser, requireUnlocked } from '../middleware/auth';
import { getPeerId } from '../lib/relations';

export default async function matchRoutes(app: FastifyInstance) {
  // POST /api/v1/matches/start - Start matching
  app.post('/start', { preHandler: [authenticate, requireUnlocked] }, async (req) => {
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
  app.post('/:id/end', { preHandler: authenticate }, async (req, reply) => {
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
      return reply.status(404).send({ error: 'Match not found' });
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

    const peerId = getPeerId(match, authUser.id);

    // Mirror the socket `end_match` behavior: increment both users' conversation
    // counts and notify the peer so the client state stays consistent regardless
    // of which transport ended the match.
    await Promise.all([
      prisma.user.update({ where: { id: authUser.id }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
      prisma.user.update({ where: { id: peerId }, data: { status: 'ONLINE', totalConversations: { increment: 1 } } }),
    ]);

    const io = (req as any).server.io;
    if (io) {
      io.to(`user_${peerId}`).emit('match_ended', { matchId: id, reason: 'ended' });
    }

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