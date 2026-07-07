import { FastifyInstance } from 'fastify';

import authRoutes from './auth';
import userRoutes from './user';
import matchRoutes from './match';
import chatRoutes from './chat';
import friendRoutes from './friend';
import notificationRoutes from './notification';
import reportRoutes from './report';
import premiumRoutes from './premium';
import adminRoutes from './admin';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(matchRoutes, { prefix: '/api/v1/matches' });
  await app.register(chatRoutes, { prefix: '/api/v1/chat' });
  await app.register(friendRoutes, { prefix: '/api/v1/friends' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(premiumRoutes, { prefix: '/api/v1/premium' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
}