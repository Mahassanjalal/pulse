import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

async function requestLogger(app: FastifyInstance) {
  app.decorateRequest('correlationId', '');

  // Generate correlationId and log incoming request
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId =
      (request.headers['x-correlation-id'] as string) || randomUUID();

    request.correlationId = correlationId;

    reply.header('X-Correlation-Id', correlationId);

    request.log.info(
      {
        correlationId,
        method: request.method,
        url: request.url,
        body: JSON.stringify(request.body || {}),
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      `→ ${request.method} ${request.url}`
    );
  });

  // Log outgoing response with duration
  app.addHook(
    'onResponse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const duration = reply.elapsedTime;
      const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';

      request.log[level](
        {
          correlationId: request.correlationId,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          duration: `${duration.toFixed(2)}ms`,
        },
        `← ${request.method} ${request.url} ${reply.statusCode} (${duration.toFixed(2)}ms)`
      );
    }
  );

  // Log errors with full context
  app.addHook(
    'onError',
    async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
      request.log.error(
        {
          correlationId: request.correlationId,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        `✗ ${request.method} ${request.url} - ${error.message}`
      );
    }
  );
}

export default fp(requestLogger, { name: 'request-logger' });
