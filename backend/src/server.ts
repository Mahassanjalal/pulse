import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import jwtPlugin from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Server as SocketIOServer } from 'socket.io';

import { prisma } from './lib/prisma';
import { registerRoutes } from './routes';
import { setupSocketHandlers } from './socket/handlers';
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

  const io = new SocketIOServer(app.server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:4200',
      credentials: true,
    },
    transports: ['websocket'],
  });

  app.decorate('io', io);

  app.setErrorHandler((error: any, request, reply) => {
    const statusCode = error.statusCode || 500;
    const correlationId = (request as any).correlationId;

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