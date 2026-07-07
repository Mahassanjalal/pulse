import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { CreateReportSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';

export default async function reportRoutes(app: FastifyInstance) {
  // POST /api/v1/reports - Create a report
  app.post('/', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const data = CreateReportSchema.parse(req.body);
    
    if (data.reportedUserId === authUser.id) {
      return { error: 'Cannot report yourself' };
    }
    
    const report = await prisma.report.create({
      data: {
        reporterId: authUser.id,
        reportedUserId: data.reportedUserId,
        category: data.category,
        description: data.description,
      },
    });
    
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