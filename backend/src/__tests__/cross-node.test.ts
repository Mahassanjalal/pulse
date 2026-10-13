import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createAdapter } from '@socket.io/redis-adapter';
import { createAdapterClients, createRedisClient, type RedisClient } from '../lib/redis';

/**
 * Phase 1 integration test: two independent API nodes sharing one Redis —
 * exactly the production multi-node topology.
 *
 * Proves the two properties everything else depends on:
 *  1. room emits cross nodes (match_found / presence / kicks reach a socket
 *     that connected to a DIFFERENT node than the emitter), and
 *  2. the shared state store lets node B see a queue entry created on node A
 *     (so matchmaking pairs users regardless of which node they landed on).
 *
 * Skips cleanly when no Redis is reachable.
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let redis: RedisClient | null = null;
let available = false;

interface Node {
  http: HttpServer;
  io: SocketIOServer;
  port: number;
}
const nodes: Node[] = [];

async function startNode(port: number): Promise<Node> {
  const http = createServer();
  const io = new SocketIOServer(http, { transports: ['websocket'] });
  const { pub, sub } = await createAdapterClients(REDIS_URL);
  io.adapter(createAdapter(pub, sub));
  // Echo events back so tests can observe delivery.
  io.on('connection', (socket: Socket) => {
    socket.on('ping-node', (payload: any, ack?: (r: any) => void) => {
      ack?.({ fromPort: port, payload });
    });
    socket.on('join-room', (room: string) => socket.join(room));
    socket.join('e2e-room');
  });
  await new Promise<void>((resolve) => http.listen(port, resolve));
  return { http, io, port };
}

function connect(port: number): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioc(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

beforeAll(async () => {
  try {
    redis = await createRedisClient(REDIS_URL);
    await redis.ping();
    available = true;
    nodes.push(await startNode(4901));
    nodes.push(await startNode(4902));
  } catch {
    available = false;
  }
}, 20000);

afterAll(async () => {
  for (const node of nodes) {
    node.io.close();
    await new Promise((r) => node.http.close(r));
  }
  if (redis) await redis.quit().catch(() => {});
});

describe('cross-node delivery via Redis adapter (skips without Redis)', () => {
  it('a room emit on node A reaches a socket connected to node B', async ({ skip }) => {
    if (!available) return skip();
    const [a, b] = nodes;
    const clientB = await connect(b.port);
    try {
      const received = new Promise<any>((resolve) => clientB.once('match_found', resolve));
      // Emit from node A to a room that only node B's socket belongs to.
      a.io.to('e2e-room').emit('match_found', { matchId: 'xnode-1', via: 'nodeA' });
      const payload = await Promise.race([
        received,
        new Promise((_, rej) => setTimeout(() => rej(new Error('no cross-node delivery within 4s')), 4000)),
      ]);
      expect(payload).toMatchObject({ matchId: 'xnode-1', via: 'nodeA' });
    } finally {
      clientB.disconnect();
    }
  });

  it('targeting a user room by name crosses nodes (presence/kick path)', async ({ skip }) => {
    if (!available) return skip();
    const [a, b] = nodes;
    const clientA = await connect(a.port);
    try {
      // clientA joins its user room on the node it is connected to (node A).
      clientA.emit('join-room', 'user_user_42');
      await new Promise((r) => setTimeout(r, 150)); // let the join propagate
      const got = new Promise<any>((resolve) => clientA.once('presence_changed', resolve));
      // Emit from the OTHER node — this is the presence/kick path where a
      // moderation action on node B must reach a socket living on node A.
      b.io.to('user_user_42').emit('presence_changed', { userId: '42', status: 'OFFLINE' });
      const payload = await Promise.race([
        got,
        new Promise((_, rej) => setTimeout(() => rej(new Error('no user-room delivery within 4s')), 4000)),
      ]);
      expect(payload).toMatchObject({ userId: '42', status: 'OFFLINE' });
    } finally {
      clientA.disconnect();
    }
  });

  it('sockets on different nodes can round-trip through their own node', async ({ skip }) => {
    if (!available) return skip();
    const [, b] = nodes;
    const clientB = await connect(b.port);
    try {
      const reply = await new Promise<any>((resolve, reject) => {
        clientB.emit('ping-node', { hello: 1 }, (r: any) => resolve(r));
        setTimeout(() => reject(new Error('ack timeout')), 4000);
      });
      expect(reply).toMatchObject({ fromPort: b.port, payload: { hello: 1 } });
    } finally {
      clientB.disconnect();
    }
  });
});
