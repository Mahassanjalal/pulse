import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';

export default async function notificationRoutes(app: FastifyInstance) {
  // GET /api/v1/notifications - Get user notifications (paginated)
  app.get('/', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { page = '1', limit = '20' } = req.query as { page?: string; limit?: string };
    
    const offset = (Number(page) - 1) * Number(limit);
    
    const [notifications, unreadCount, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: authUser.id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: Number(limit),
      }),
      prisma.notification.count({ where: { userId: authUser.id, read: false } }),
      prisma.notification.count({ where: { userId: authUser.id } }),
    ]);
    
    return {
      notifications,
      unreadCount,
      totalCount,
      page: Number(page),
      hasMore: offset + Number(limit) < totalCount,
    };
  });

  // POST /api/v1/notifications/:id/read - Mark single notification as read
  app.post('/:id/read', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id } = req.params as { id: string };
    
    await prisma.notification.update({
      where: { id, userId: authUser.id },
      data: { read: true },
    });
    
    return { success: true };
  });

  // POST /api/v1/notifications/read-all - Mark all as read
  app.post('/read-all', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    await prisma.notification.updateMany({
      where: { userId: authUser.id, read: false },
      data: { read: true },
    });
    
    return { success: true };
  });

  // DELETE /api/v1/notifications/:id - Delete a notification
  app.delete('/:id', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id } = req.params as { id: string };
    
    await prisma.notification.delete({
      where: { id, userId: authUser.id },
    });
    
    return { success: true };
  });
}