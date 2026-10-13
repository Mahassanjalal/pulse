import { createRedisClient, type RedisClient } from '../redis';
import { MemoryRealtimeState } from './memory-store';
import { RedisRealtimeState } from './redis-store';
import type { RealtimeStateStore } from './types';

export type { RealtimeStateStore, QueueEntry, MatchEntry, PendingCall, PresenceEntry } from './types';
export { MemoryRealtimeState } from './memory-store';
export { RedisRealtimeState } from './redis-store';

let store: RealtimeStateStore | null = null;
let sharedRedisClient: RedisClient | null = null;

/**
 * Initialise the realtime state store. Driven by REDIS_URL:
 *   - set     -> RedisRealtimeState (multi-node safe)
 *   - unset   -> MemoryRealtimeState (identical to pre-Phase-1 behaviour)
 * Called once from server.ts before socket handlers are attached.
 */
export async function initRealtimeStore(): Promise<RealtimeStateStore> {
  if (store) return store;
  const url = process.env.REDIS_URL;
  if (url) {
    sharedRedisClient = await createRedisClient(url);
    store = new RedisRealtimeState(sharedRedisClient);
    console.log('[state] realtime state store: redis');
  } else {
    store = new MemoryRealtimeState();
    console.log('[state] realtime state store: in-memory (set REDIS_URL for multi-node)');
  }
  return store;
}

/** Active store — auto-initialises to memory when server boot skipped init (tests). */
export function getStore(): RealtimeStateStore {
  if (!store) {
    store = new MemoryRealtimeState();
  }
  return store;
}

/** Test/shutdown helper. */
export async function resetRealtimeStore(): Promise<void> {
  if (store) await store.close();
  if (sharedRedisClient) {
    try {
      await sharedRedisClient.quit();
    } catch {
      /* already closed */
    }
  }
  store = null;
  sharedRedisClient = null;
}
