import type { RedisClient } from '../redis';
import { queueScore } from './score';
import type {
  MatchEntry,
  PendingCall,
  PresenceEntry,
  QueueEntry,
  RealtimeStateStore,
} from './types';

/**
 * Shared Redis-backed realtime state (AUDIT-AND-PLAN Phase 1).
 *
 * Key design (all keys prefixed by purpose; TTLs make crashed nodes self-heal):
 *   q:wait                 HASH  userId -> JSON(QueueEntry)     (matchmaking queue data)
 *   q:rank                 ZSET  userId score=queueScore        (Phase 3 priority order:
 *                              premium head start + FIFO; ZPOPMIN-style atomic dequeue)
 *   q:claim:{userId}       STRING "1" EX 60                     (handshake claim, TTL-capped)
 *   m:active               HASH  matchId -> JSON(MatchEntry)    (active matches)
 *   m:byuser               HASH  userId -> matchId              (O(1) in-call + reconnect replay)
 *   call:{callId}          STRING JSON(PendingCall) EX ttl      (pending direct call)
 *   call:for:{userId}      SET   callIds EX ttl                 (busy checks, both roles)
 *   conn:{userId}          SET   socketIds EX 180               (cross-node multi-tab)
 *   conn:sock:{socketId}   STRING "1" EX 180                    (per-socket lease, ghosts self-heal)
 *   pres:{userId}          HASH  {status,lastSeen} EX 180       (presence + heartbeat lease)
 *   pres:status:{STATUS}   SET   userIds                        (status indexes incl. online count)
 *
 * Contention is resolved with small Lua scripts so two nodes can never
 * double-claim a waiting user, double-create a pending call, or race a
 * presence transition.
 */
export class RedisRealtimeState implements RealtimeStateStore {
  readonly kind = 'redis' as const;

  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private redis: RedisClient,
    sweepIntervalMs = Number(process.env.REDIS_SWEEP_INTERVAL_MS || 60_000),
  ) {
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweepExpiredPresence().catch((err) => console.error('[state] presence sweep failed:', err));
      }, sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  // ------------------------------------------------------------------ queue
  async joinQueue(userId: string, entry: QueueEntry): Promise<void> {
    const pipe = this.redis.multi();
    pipe.hSet('q:wait', userId, JSON.stringify(entry));
    pipe.zAdd('q:rank', [{ score: queueScore(entry), value: userId }]);
    await pipe.exec();
  }
  async leaveQueue(userId: string): Promise<void> {
    const pipe = this.redis.multi();
    pipe.hDel('q:wait', userId);
    pipe.zRem('q:rank', [userId]);
    await pipe.exec();
  }
  async getQueueEntry(userId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.hGet('q:wait', userId);
    return raw ? (JSON.parse(raw) as QueueEntry) : null;
  }
  async listQueue(): Promise<Array<[string, QueueEntry]>> {
    const ids = (await this.redis.zRange('q:rank', 0, -1)) as string[];
    if (!ids.length) return [];
    const pipe = this.redis.multi();
    for (const id of ids) pipe.hGet('q:wait', id);
    const raws = (await pipe.exec()) as unknown as Array<string | null>;
    const out: Array<[string, QueueEntry]> = [];
    const orphans: string[] = [];
    ids.forEach((id, i) => {
      const raw = raws[i];
      if (raw) out.push([id, JSON.parse(raw) as QueueEntry]);
      else orphans.push(id); // score without data — self-heal
    });
    if (orphans.length) await this.redis.zRem('q:rank', orphans);
    return out;
  }
  async queueSize(): Promise<number> {
    // ZCARD = what scanners actually see (mirrors listQueue; a claimed/
    // in-flight candidate is dequeued but still has hash data).
    return this.redis.zCard('q:rank');
  }

  /**
   * Phase 3 atomic dequeue (Lua): claim check + hash read + ZREM + claim SET
   * happen as one indivisible step, so two scanners on two nodes can never
   * dequeue the same waiting user (the plan's "atomic dequeue so two workers
   * can never claim the same user").
   */
  async claimCandidate(userId: string): Promise<QueueEntry | null> {
    const script = `
      local uid = ARGV[1]
      if redis.call('EXISTS', 'q:claim:' .. uid) == 1 then return nil end
      local data = redis.call('HGET', 'q:wait', uid)
      if not data then return nil end
      if redis.call('ZREM', 'q:rank', uid) == 0 then return nil end
      redis.call('SET', 'q:claim:' .. uid, '1', 'EX', 60)
      return data
    `;
    const raw = (await this.redis.eval(script, { keys: [], arguments: [userId] })) as string | null;
    return raw ? (JSON.parse(raw) as QueueEntry) : null;
  }
  async requeueCandidate(userId: string, entry: QueueEntry): Promise<void> {
    const pipe = this.redis.multi();
    pipe.zAdd('q:rank', [{ score: queueScore(entry), value: userId }]);
    pipe.hSet('q:wait', userId, JSON.stringify(entry));
    pipe.del(`q:claim:${userId}`);
    await pipe.exec();
  }

  /**
   * Atomic both-or-nothing claim (Lua). The TTL on claims means a node that
   * dies mid-handshake can't poison other users forever — the original
   * in-memory Set had exactly that leak.
   */
  async claimUsers(...userIds: string[]): Promise<boolean> {
    if (userIds.length === 0) return false;
    const script = `
      local ttl = ARGV[1]
      for i = 2, #ARGV do
        if redis.call('EXISTS', 'q:claim:' .. ARGV[i]) == 1 then
          return 0
        end
      end
      for i = 2, #ARGV do
        redis.call('SET', 'q:claim:' .. ARGV[i], '1', 'EX', ttl)
      end
      return 1
    `;
    const result = await this.redis.eval(script, {
      keys: [],
      arguments: ['60', ...userIds],
    });
    return Number(result) === 1;
  }
  async releaseUsers(...userIds: string[]): Promise<void> {
    if (userIds.length) await this.redis.del(userIds.map((id) => `q:claim:${id}`));
  }

  // ---------------------------------------------------------------- matches
  async addMatch(match: MatchEntry): Promise<void> {
    const pipe = this.redis.multi();
    pipe.hSet('m:active', match.matchId, JSON.stringify(match));
    pipe.hSet('m:byuser', match.user1, match.matchId);
    pipe.hSet('m:byuser', match.user2, match.matchId);
    await pipe.exec();
  }
  async getMatch(matchId: string): Promise<MatchEntry | null> {
    const raw = await this.redis.hGet('m:active', matchId);
    return raw ? (JSON.parse(raw) as MatchEntry) : null;
  }
  async deleteMatch(matchId: string): Promise<MatchEntry | null> {
    // Atomic take (Lua): read + HDEL the match AND clear both users' index
    // entries as one step, so two nodes racing teardown can't both process it
    // or leave a stale user->match pointer. (HGETDEL is Redis >=7.4; we
    // target 7.2, and cjson ships with Redis Lua.)
    const script = `
      local v = redis.call('HGET', KEYS[1], ARGV[1])
      if not v then return nil end
      redis.call('HDEL', KEYS[1], ARGV[1])
      local m = cjson.decode(v)
      for _, u in ipairs({m.user1, m.user2}) do
        if redis.call('HGET', KEYS[2], u) == ARGV[1] then
          redis.call('HDEL', KEYS[2], u)
        end
      end
      return v
    `;
    const raw = (await this.redis.eval(script, {
      keys: ['m:active', 'm:byuser'],
      arguments: [matchId],
    })) as string | null;
    return raw ? (JSON.parse(raw) as MatchEntry) : null;
  }
  async isUserInMatch(userId: string): Promise<boolean> {
    return Boolean(await this.redis.hExists('m:byuser', userId));
  }
  async getMatchForUser(userId: string): Promise<MatchEntry | null> {
    const matchId = (await this.redis.hGet('m:byuser', userId)) as string | null;
    if (!matchId) return null;
    const raw = (await this.redis.hGet('m:active', matchId)) as string | null;
    if (!raw) {
      // Orphaned pointer (crash between writes) — self-heal.
      await this.redis.hDel('m:byuser', userId);
      return null;
    }
    return JSON.parse(raw) as MatchEntry;
  }
  async listMatches(): Promise<Array<[string, MatchEntry]>> {
    const all = await this.redis.hGetAll('m:active');
    return Object.entries(all).map(([id, raw]) => [id, JSON.parse(raw) as MatchEntry]);
  }

  // ---------------------------------------------------------- pending calls
  async createPendingCall(
    callId: string,
    call: PendingCall,
    ttlSeconds: number,
  ): Promise<{ created: boolean; busyRole?: 'caller' | 'callee' }> {
    const script = `
      local caller, callee, callId, ttl, json = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
      if redis.call('SCARD', 'call:for:' .. caller) > 0 then
        return {'0', 'caller'}
      end
      if redis.call('SCARD', 'call:for:' .. callee) > 0 then
        return {'0', 'callee'}
      end
      redis.call('SADD', 'call:for:' .. caller, callId)
      redis.call('EXPIRE', 'call:for:' .. caller, ttl)
      redis.call('SADD', 'call:for:' .. callee, callId)
      redis.call('EXPIRE', 'call:for:' .. callee, ttl)
      redis.call('SET', 'call:' .. callId, json, 'EX', ttl)
      return {'1', ''}
    `;
    const result = (await this.redis.eval(script, {
      keys: [],
      arguments: [call.callerId, call.calleeId, callId, String(ttlSeconds), JSON.stringify(call)],
    })) as string[];
    if (Number(result[0]) === 1) return { created: true };
    return { created: false, busyRole: (result[1] as 'caller' | 'callee') || 'caller' };
  }
  async getPendingCall(callId: string): Promise<PendingCall | null> {
    const raw = await this.redis.get(`call:${callId}`);
    return raw ? (JSON.parse(raw) as PendingCall) : null;
  }
  async deletePendingCall(callId: string): Promise<PendingCall | null> {
    const raw = (await this.redis.getDel(`call:${callId}`)) as string | null;
    if (!raw) return null;
    const call = JSON.parse(raw) as PendingCall;
    await this.redis.sRem(`call:for:${call.callerId}`, callId);
    await this.redis.sRem(`call:for:${call.calleeId}`, callId);
    return call;
  }
  async pendingCallIdsFor(userId: string): Promise<string[]> {
    const ids = await this.redis.sMembers(`call:for:${userId}`);
    return (ids as string[]).map(String);
  }

  // ---------------------------------------------------------------- sockets
  async addSocket(userId: string, socketId: string): Promise<{ first: boolean }> {
    const script = `
      local userId, socketId, ttl = ARGV[1], ARGV[2], ARGV[3]
      local first = redis.call('SCARD', 'conn:' .. userId) == 0 and 1 or 0
      redis.call('SADD', 'conn:' .. userId, socketId)
      redis.call('EXPIRE', 'conn:' .. userId, ttl)
      redis.call('SET', 'conn:sock:' .. socketId, '1', 'EX', ttl)
      return first
    `;
    const result = await this.redis.eval(script, {
      keys: [],
      arguments: [userId, socketId, '180'],
    });
    return { first: Number(result) === 1 };
  }
  async removeSocket(userId: string, socketId: string): Promise<{ last: boolean }> {
    const pipeline = this.redis.multi();
    pipeline.sRem(`conn:${userId}`, socketId);
    pipeline.del(`conn:sock:${socketId}`);
    await pipeline.exec();

    // Self-healing: drop members whose per-socket lease expired (their node
    // crashed without a clean disconnect) before deciding "last".
    const members = (await this.redis.sMembers(`conn:${userId}`)) as string[];
    if (members.length === 0) return { last: true };
    const leases = await Promise.all(
      members.map((m) => this.redis.exists(`conn:sock:${m}`)),
    );
    const live = members.filter((_, i) => leases[i] === 1);
    const dead = members.filter((_, i) => leases[i] === 0);
    if (dead.length) await this.redis.sRem(`conn:${userId}`, dead);
    return { last: live.length === 0 };
  }
  async touchConnections(userId: string): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.expire(`conn:${userId}`, 180);
    await pipeline.exec();
  }
  async hasSockets(userId: string): Promise<boolean> {
    return (await this.redis.exists(`conn:${userId}`)) === 1;
  }

  // -------------------------------------------------------------- presence
  async setPresence(userId: string, status: string, lastSeenMs: number): Promise<void> {
    const script = `
      local userId, status, seen, ttl = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
      local pkey = 'pres:' .. userId
      local old = redis.call('HGET', pkey, 'status')
      if old and old ~= status then
        redis.call('SREM', 'pres:status:' .. old, userId)
      end
      redis.call('HSET', pkey, 'status', status, 'lastSeen', seen)
      redis.call('EXPIRE', pkey, ttl)
      redis.call('SADD', 'pres:status:' .. status, userId)
      return 1
    `;
    await this.redis.eval(script, {
      keys: [],
      arguments: [userId, status, String(lastSeenMs), '180'],
    });
  }
  async touchLastSeen(userId: string, lastSeenMs: number): Promise<void> {
    const script = `
      local userId, seen, ttl = ARGV[1], ARGV[2], ARGV[3]
      local pkey = 'pres:' .. userId
      if redis.call('EXISTS', pkey) == 0 then
        redis.call('HSET', pkey, 'status', 'ONLINE')
        redis.call('SADD', 'pres:status:ONLINE', userId)
      end
      redis.call('HSET', pkey, 'lastSeen', seen)
      redis.call('EXPIRE', pkey, ttl)
      return 1
    `;
    await this.redis.eval(script, { keys: [], arguments: [userId, String(lastSeenMs), '180'] });
  }
  async getPresence(userId: string): Promise<PresenceEntry | null> {
    const data = await this.redis.hGetAll(`pres:${userId}`);
    if (!data.status) return null;
    return { status: data.status, lastSeen: Number(data.lastSeen || 0) };
  }
  async getPresences(userIds: string[]): Promise<Record<string, PresenceEntry>> {
    const out: Record<string, PresenceEntry> = {};
    if (!userIds.length) return out;
    const pipeline = this.redis.multi();
    for (const id of userIds) pipeline.hGetAll(`pres:${id}`);
    const results = (await pipeline.exec()) as Array<{ status?: string; lastSeen?: string } | null>;
    userIds.forEach((id, i) => {
      const data = results?.[i];
      if (data?.status) out[id] = { status: data.status, lastSeen: Number(data.lastSeen || 0) };
    });
    return out;
  }
  async onlineCount(): Promise<number> {
    return this.redis.sCard('pres:status:ONLINE');
  }

  /**
   * Remove ONLINE/OFFLINE/MATCHING index members whose presence key has
   * expired (crashed nodes). Keeps onlineCount honest without per-heartbeat
   * database writes.
   */
  private async sweepExpiredPresence(): Promise<void> {
    for (const status of ['ONLINE', 'OFFLINE', 'MATCHING']) {
      const setKey = `pres:status:${status}`;
      let cursor = '0';
      do {
        const page = await this.redis.sScan(setKey, cursor, { COUNT: 1000 });
        cursor = String(page.cursor);
        const members = page.members.map(String);
        if (!members.length) continue;
        const alive = await Promise.all(members.map((m: string) => this.redis.exists(`pres:${m}`)));
        const dead = members.filter((_: string, i: number) => alive[i] === 0);
        if (dead.length) await this.redis.sRem(setKey, dead);
      } while (cursor !== '0');
    }
  }

  async close(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}
