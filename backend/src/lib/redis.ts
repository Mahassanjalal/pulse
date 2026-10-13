import { createClient, type RedisClientType } from 'redis';

/**
 * Redis client lifecycle for Phase 1 (AUDIT-AND-PLAN).
 *
 * When REDIS_URL is set the backend gets:
 *   - a shared command client (used by the realtime state store), and
 *   - a dedicated pub/sub pair for the Socket.IO Redis adapter.
 * When REDIS_URL is absent (local dev / tests) everything falls back to the
 * in-memory implementations and behaviour is identical to the pre-Phase-1
 * single-node deployment.
 *
 * NOTE (scale): Redis carries only EPHEMERAL state — presence, heartbeat
 * leases, the matchmaking queue, active-match registry and pending calls.
 * Durable records (accounts, matches, messages, ledger) stay in Postgres.
 */

export type RedisClient = RedisClientType;

function connectErrorHandler(client: RedisClient, label: string): void {
  client.on('error', (err: Error) => {
    // Log and keep going: callers degrade to in-memory behaviour only if the
    // store itself decides to; a noisy redis must not crash the API node.
    console.error(`[redis:${label}]`, err.message);
  });
}

/** Create + connect a standalone command client. */
export async function createRedisClient(url: string): Promise<RedisClient> {
  const client = createClient({ url });
  connectErrorHandler(client, 'main');
  await client.connect();
  return client;
}

/**
 * Create + connect the dedicated pub/sub pair required by the Socket.IO
 * Redis adapter (it needs two clients that are not shared with normal
 * commands — the subscriber enters RESP2 subscribe mode).
 */
export async function createAdapterClients(
  url: string,
): Promise<{ pub: RedisClient; sub: RedisClient }> {
  const pub = createClient({ url });
  connectErrorHandler(pub, 'pub');
  const sub = pub.duplicate();
  connectErrorHandler(sub, 'sub');
  await Promise.all([pub.connect(), sub.connect()]);
  return { pub, sub };
}
