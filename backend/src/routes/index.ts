import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

import { renderMetrics, metrics } from '../lib/metrics';
import { getStore } from '../lib/state';
import authRoutes from './auth';
import userRoutes from './user';
import matchRoutes from './match';
import chatRoutes from './chat';
import friendRoutes from './friend';
import notificationRoutes from './notification';
import reportRoutes from './report';
import premiumRoutes from './premium';
import adminRoutes from './admin';
import leaderboardRoutes from './leaderboard';
import authExtraRoutes from './auth-extra';
import moderationRoutes from './moderation';
import coinRoutes from './coins';
import uploadRoutes from './uploads';
import webrtcRoutes from './webrtc';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Prometheus scrape endpoint (Phase 6). Disabled with ENABLE_METRICS=false;
  // when METRICS_TOKEN is set, requires `Authorization: Bearer <token>` (or
  // `?token=`). Contains operational counters only — no user data.
  app.get('/metrics', async (req, reply) => {
    if (process.env.ENABLE_METRICS === 'false') {
      return reply.code(404).send({ error: 'Not Found' });
    }
    const expected = process.env.METRICS_TOKEN;
    if (expected) {
      const header = req.headers.authorization || '';
      const provided = header.startsWith('Bearer ')
        ? header.slice(7)
        : ((req.query as { token?: string })?.token ?? '');
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      const ok = a.length === b.length && timingSafeEqual(a, b);
      if (!ok) return reply.code(401).send({ error: 'Unauthorized' });
    }
    // Queue depth is live state — resolve it at scrape time.
    try {
      metrics.queueDepth.set(await getStore().queueSize());
    } catch {
      // store unavailable — still render what we have
    }
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetrics());
  });
  
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(authExtraRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(matchRoutes, { prefix: '/api/v1/matches' });
  await app.register(chatRoutes, { prefix: '/api/v1/chat' });
  await app.register(friendRoutes, { prefix: '/api/v1/friends' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(premiumRoutes, { prefix: '/api/v1/premium' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(leaderboardRoutes, { prefix: '/api/v1' });
  await app.register(moderationRoutes, { prefix: '/api/v1/moderation' });
  await app.register(coinRoutes, { prefix: '/api/v1/coins' });
  await app.register(uploadRoutes, { prefix: '/api/v1/uploads' });
  await app.register(webrtcRoutes, { prefix: '/api/v1/webrtc' });
}