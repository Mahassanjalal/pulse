import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import fastify from 'fastify';
import cors from '@fastify/cors';
import jwtPlugin from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import staticPlugin from '@fastify/static';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Server as SocketIOServer } from 'socket.io';

import { prisma } from './lib/prisma';
import { registerRoutes } from './routes';
import { ensureUploadDir, UPLOAD_DIR } from './lib/storage';
import { setupSocketHandlers } from './socket/handlers';
import { handleStripeWebhook } from './routes/premium';
import { setNotificationIO } from './lib/notifications';
import requestLogger from './plugins/request-logger';
import { revokeExpiredPremium } from './routes/premium';
import { initRealtimeStore, resetRealtimeStore, getStore } from './lib/state';
import { metrics } from './lib/metrics';
import { createAdapterClients } from './lib/redis';

// M17: honor X-Forwarded-For from the platform load balancer so req.ip (used
// by rate limiters, login history and audit logs) is the real client IP, not
// the LB. Without this, rate limits and IP audit trails are spoofable/useless.
const app = fastify({
  trustProxy: true,
  logger: process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
    }
  } : true
});

async function start() {
  // CORS: primary origin + optional comma-separated APP_ORIGINS allowlist
  // (for preview domains / alternate frontends in production).
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:4200',
    ...(process.env.APP_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  ];
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin / server-to-server requests have no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  });

  await app.register(jwtPlugin, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '15m' },
  });

  await app.register(requestLogger);

  // M1: global HTTP rate limit as a backstop (per-route tightening lives in
  // each route via lib/limits.ts). In-memory store = per-node; swap for a
  // Redis store when running multiple nodes (AUDIT-AND-PLAN Phase 2).
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    timeWindow: '1 minute',
    keyGenerator: (req) => (req as any).authUser?.id || req.ip,
    allowList: (req) => (req.raw.url || '').startsWith('/api/v1/health') || (req.raw.url || '') === '/health',
  });

  app.decorateRequest('authUser', null);

  // Capture the raw request body for JSON so the Stripe webhook can verify the
  // signature (constructEvent needs the unparsed bytes). The parsed object is
  // still available as req.body on every route.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    (req as any).rawBody = body;
    try {
      done(null, body.length ? JSON.parse(body.toString('utf8')) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  // M14: don't expose the API schema in production unless explicitly asked.
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SWAGGER_ENABLED !== 'false');
  if (swaggerEnabled) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Pulse API',
        description: 'API for the Pulse random video chat platform',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });
  }

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // Phase 6 observability: per-route request metrics (bounded cardinality —
  // the route PATTERN is the label, never the raw URL). Start time rides on
  // the request via a Symbol to avoid decorating the request object.
  const START = Symbol.for('pulse.reqStart');
  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<symbol, number>)[START] = Date.now();
  });
  app.addHook('onResponse', async (req, reply) => {
    try {
      const start = (req as unknown as Record<symbol, number>)[START];
      if (!start) return;
      const route = req.routeOptions?.url ?? 'unmatched';
      const statusClass = `${Math.floor(reply.statusCode / 100)}xx`;
      metrics.httpRequests.inc({ route, status: statusClass });
      metrics.httpDuration.observe((Date.now() - start) / 1000, { route });
    } catch {
      // metrics must never break a response
    }
  });

  await registerRoutes(app);

  // Uploaded images (profile pictures, cover images, chat media) are persisted
  // to disk in UPLOAD_DIR and served from /uploads. In production UPLOAD_DIR
  // lives inside the Railway `data` volume so files survive deploys. A second
  // static registration with decorateReply:false avoids clashing with the SPA
  // plugin's sendFile decoration.
  ensureUploadDir();
  await app.register(staticPlugin, {
    root: UPLOAD_DIR,
    prefix: '/uploads',
    decorateReply: false,
  });

  // In production the Angular SPA is built into backend/public and served from
  // the same origin as the API (so environment.prod.ts apiUrl '/api/v1' and the
  // socket wsUrl derived from window.location both work without extra config).
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    await app.register(staticPlugin, {
      root: publicDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url || '';
      if (url.startsWith('/api') || url.startsWith('/docs')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Stripe webhook: must read the raw request body to verify the signature.
  // The raw bytes are captured by the application/json content-type parser
  // into req.rawBody; we just forward to the handler.
  app.post('/api/v1/premium/webhook', (req, reply) => {
    return handleStripeWebhook(req, reply);
  });

  const io = new SocketIOServer(app.server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket'],
    // M1: chat messages are capped at 5,000 chars by the schema; cap the
    // transport buffer well below the 1MB default so a malicious client can't
    // push megabyte frames at the server.
    maxHttpBufferSize: 100 * 1024,
    // Phase 2: NATIVE PING/PONG IS THE LIVENESS MECHANISM. The server pings
    // every 25s and disconnects sockets that don't answer within 20s
    // (~45s worst-case detection) — replacing the old custom 90s heartbeat
    // timeout (which duplicated it and could disagree with it). These are
    // engine-level liveness packets: clients answer automatically, they do
    // not go through app code. Keep them BELOW any load-balancer idle
    // timeouts (usually >=60s) so LBs never sever healthy sockets.
    pingInterval: Number(process.env.SOCKET_PING_INTERVAL_MS || 25_000),
    pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT_MS || 20_000),
    // Reject malformed handshakes fast — a slow-loris style connection that
    // never completes auth shouldn't hold a slot for the 60s default.
    connectTimeout: Number(process.env.SOCKET_CONNECT_TIMEOUT_MS || 10_000),
  });

  // Phase 1/2: shared realtime state + cross-node broadcasts.
  //  - initRealtimeStore(): Redis-backed queue/matches/calls/presence when
  //    REDIS_URL is set, in-memory otherwise (single-node dev parity).
  //  - Redis adapter: io.to()/rooms reach sockets on OTHER nodes, which is
  //    what makes multi-node presence, match_found and kicks actually work.
  await initRealtimeStore();
  let adapterClients: { pub: any; sub: any } | null = null;
  if (process.env.REDIS_URL) {
    try {
      adapterClients = await createAdapterClients(process.env.REDIS_URL);
      const { createAdapter } = await import('@socket.io/redis-adapter');
      io.adapter(createAdapter(adapterClients.pub, adapterClients.sub));
      app.log.info('Socket.IO Redis adapter active (multi-node broadcasts enabled)');
    } catch (err) {
      app.log.error({ err }, 'Failed to attach Redis adapter — broadcasts are node-local');
      adapterClients = null;
    }
  } else {
    app.log.warn('REDIS_URL not set — running single-node (in-memory state, no cross-node broadcasts)');
  }

  app.decorate('io', io);
  setNotificationIO(io);

  app.setErrorHandler((error: any, request, reply) => {
    const correlationId = (request as any).correlationId;

    // Zod validation failures should return 400 with field-level issues,
    // not a generic 500 (ZodError has no statusCode of its own).
    if (error?.name === 'ZodError' && Array.isArray(error.issues)) {
      request.log.warn(
        { correlationId, issues: error.issues },
        `Validation failed: ${request.method} ${request.url}`
      );
      return reply.status(400).send({
        error: 'Validation failed',
        issues: error.issues.map((i: any) => ({
          path: i.path?.join('.') || '',
          message: i.message,
        })),
        correlationId,
      });
    }

    const statusCode = error.statusCode || 500;

    request.log.error(
      {
        correlationId,
        statusCode,
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        },
      },
      `Request failed: ${error.message}`
    );

    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : error.message,
      code: error.code,
      correlationId,
    });
  });

  await app.ready();

  setupSocketHandlers(io, app);

  // H8: nothing enforced premium expiry before — lapsed subscribers kept
  // perks forever. Sweep daily (and once at boot).
  const sweepExpiredPremium = () => {
    revokeExpiredPremium()
      .then((count) => {
        if (count > 0) app.log.info({ revoked: count }, 'Revoked expired premium subscriptions');
      })
      .catch((err) => app.log.error({ err }, 'Premium expiry sweep failed'));
  };
  sweepExpiredPremium();
  const premiumSweep = setInterval(sweepExpiredPremium, 24 * 60 * 60 * 1000);

  const PORT = Number(process.env.PORT) || 3000;
  await app.listen({ port: PORT, host: '0.0.0.0' });

  app.log.info(`API Docs at http://localhost:${PORT}/docs`);
  app.log.info(`Socket.IO ready on ws://localhost:${PORT}`);

  const shutdown = async () => {
    app.log.info('Shutting down gracefully...');
    clearInterval(premiumSweep);
    io.close();
    await resetRealtimeStore().catch(() => {});
    if (adapterClients) {
      await adapterClients.pub.quit().catch(() => {});
      await adapterClients.sub.quit().catch(() => {});
    }
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});