import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import fastify from 'fastify';
import cors from '@fastify/cors';
import jwtPlugin from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import staticPlugin from '@fastify/static';
import { Server as SocketIOServer } from 'socket.io';

import { prisma } from './lib/prisma';
import { registerRoutes } from './routes';
import { setupSocketHandlers } from './socket/handlers';
import { handleStripeWebhook } from './routes/premium';
import { setNotificationIO } from './lib/notifications';
import requestLogger from './plugins/request-logger';

const app = fastify({
  logger: process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
    }
  } : true
});

async function start() {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  });

  await app.register(jwtPlugin, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '15m' },
  });

  await app.register(requestLogger);

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

  await registerRoutes(app);

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
      origin: process.env.FRONTEND_URL || 'http://localhost:4200',
      credentials: true,
    },
    transports: ['websocket'],
  });

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

  const PORT = Number(process.env.PORT) || 3000;
  await app.listen({ port: PORT, host: '0.0.0.0' });

  app.log.info(`API Docs at http://localhost:${PORT}/docs`);
  app.log.info(`Socket.IO ready on ws://localhost:${PORT}`);

  const shutdown = async () => {
    app.log.info('Shutting down gracefully...');
    io.close();
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