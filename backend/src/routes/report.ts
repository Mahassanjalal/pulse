import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { CreateReportSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';
import { lockAccount, NUDITY_CATEGORIES } from '../lib/moderation';
import { NotificationService } from '../lib/notifications';

export default async function reportRoutes(app: FastifyInstance) {
  // POST /api/v1/reports - Create a report
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const data = CreateReportSchema.parse(req.body);
    
    if (data.reportedUserId === authUser.id) {
      return reply.status(400).send({ error: 'Cannot report yourself' });
    }
    
    const report = await prisma.report.create({
      data: {
        reporterId: authUser.id,
        reportedUserId: data.reportedUserId,
        category: data.category,
        description: data.description,
      },
    });

    // Omegle-style auto-moderation: showing nudity/naked content on a call
    // instantly locks the offender's account. They can still log in but cannot
    // match, message, call, or manage friends until they pay $10 to unlock.
    if ((NUDITY_CATEGORIES as readonly string[]).includes(data.category)) {
      await lockAccount(data.reportedUserId, `Reported for ${data.category}`);
      await NotificationService.create(
        data.reportedUserId,
        'ACCOUNT_LOCKED',
        'Account Locked',
        'Your account was locked due to a nudity report. Pay $10 to unlock and reconnect.'
      );
    }
    
    return { report };
  });

  // GET /api/v1/reports/my-reports - Get user's submitted reports
  app.get('/my-reports', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    const reports = await prisma.report.findMany({
      where: { reporterId: authUser.id },
      orderBy: { createdAt: 'desc' },
    });
    
    return { reports };
  });

  // POST /api/v1/reports/:id/cancel - Cancel a pending report
  app.post('/:id/cancel', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id } = req.params as { id: string };
    
    await prisma.report.updateMany({
      where: { id, reporterId: authUser.id, status: 'PENDING' },
      data: { status: 'RESOLVED' },
    });
    
    return { success: true };
  });
}