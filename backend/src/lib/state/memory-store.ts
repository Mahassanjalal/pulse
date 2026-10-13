import type {
  MatchEntry,
  PendingCall,
  PresenceEntry,
  QueueEntry,
  RealtimeStateStore,
} from './types';

/**
 * In-memory realtime state — the exact semantics the backend had before
 * Phase 1 (single process). Used for local dev and tests (REDIS_URL unset),
 * so existing behaviour is unchanged when running one node.
 */
export class MemoryRealtimeState implements RealtimeStateStore {
  readonly kind = 'memory' as const;

  private queue = new Map<string, QueueEntry>();
  private claims = new Set<string>();
  private matches = new Map<string, MatchEntry>();
  private matchedUsers = new Set<string>();
  private pendingCalls = new Map<string, PendingCall>();
  private callsByUser = new Map<string, Set<string>>();
  private connections = new Map<string, Set<string>>();
  private presence = new Map<string, PresenceEntry>();

  // ---- queue ----
  async joinQueue(userId: string, entry: QueueEntry): Promise<void> {
    this.queue.set(userId, entry);
  }
  async leaveQueue(userId: string): Promise<void> {
    this.queue.delete(userId);
  }
  async getQueueEntry(userId: string): Promise<QueueEntry | null> {
    return this.queue.get(userId) ?? null;
  }
  async listQueue(): Promise<Array<[string, QueueEntry]>> {
    return [...this.queue.entries()];
  }
  async queueSize(): Promise<number> {
    return this.queue.size;
  }

  // ---- claims ----
  async claimUsers(...userIds: string[]): Promise<boolean> {
    for (const id of userIds) {
      if (this.claims.has(id)) return false;
    }
    for (const id of userIds) this.claims.add(id);
    return true;
  }
  async releaseUsers(...userIds: string[]): Promise<void> {
    for (const id of userIds) this.claims.delete(id);
  }

  // ---- matches ----
  async addMatch(match: MatchEntry): Promise<void> {
    this.matches.set(match.matchId, match);
    this.matchedUsers.add(match.user1);
    this.matchedUsers.add(match.user2);
  }
  async getMatch(matchId: string): Promise<MatchEntry | null> {
    return this.matches.get(matchId) ?? null;
  }
  async deleteMatch(matchId: string): Promise<MatchEntry | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    this.matches.delete(matchId);
    this.matchedUsers.delete(match.user1);
    this.matchedUsers.delete(match.user2);
    return match;
  }
  async isUserInMatch(userId: string): Promise<boolean> {
    return this.matchedUsers.has(userId);
  }
  async listMatches(): Promise<Array<[string, MatchEntry]>> {
    return [...this.matches.entries()];
  }

  // ---- pending calls ----
  async createPendingCall(
    callId: string,
    call: PendingCall,
    _ttlSeconds: number,
  ): Promise<{ created: boolean; busyRole?: 'caller' | 'callee' }> {
    if (this.callsByUser.has(call.callerId)) return { created: false, busyRole: 'caller' };
    if (this.callsByUser.has(call.calleeId)) return { created: false, busyRole: 'callee' };
    this.pendingCalls.set(callId, call);
    this.addToIndex(call.callerId, callId);
    this.addToIndex(call.calleeId, callId);
    return { created: true };
  }
  async getPendingCall(callId: string): Promise<PendingCall | null> {
    return this.pendingCalls.get(callId) ?? null;
  }
  async deletePendingCall(callId: string): Promise<PendingCall | null> {
    const call = this.pendingCalls.get(callId);
    if (!call) return null;
    this.pendingCalls.delete(callId);
    this.removeFromIndex(call.callerId, callId);
    this.removeFromIndex(call.calleeId, callId);
    return call;
  }
  async pendingCallIdsFor(userId: string): Promise<string[]> {
    return [...(this.callsByUser.get(userId) ?? [])];
  }

  private addToIndex(userId: string, callId: string): void {
    let set = this.callsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.callsByUser.set(userId, set);
    }
    set.add(callId);
  }
  private removeFromIndex(userId: string, callId: string): void {
    const set = this.callsByUser.get(userId);
    if (!set) return;
    set.delete(callId);
    if (set.size === 0) this.callsByUser.delete(userId);
  }

  // ---- sockets ----
  async addSocket(userId: string, socketId: string): Promise<{ first: boolean }> {
    let set = this.connections.get(userId);
    const first = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    set.add(socketId);
    return { first };
  }
  async removeSocket(userId: string, socketId: string): Promise<{ last: boolean }> {
    const set = this.connections.get(userId);
    if (!set) return { last: true };
    set.delete(socketId);
    if (set.size === 0) {
      this.connections.delete(userId);
      return { last: true };
    }
    return { last: false };
  }
  async touchConnections(_userId: string): Promise<void> {
    /* in-memory keys don't expire */
  }
  async hasSockets(userId: string): Promise<boolean> {
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }

  // ---- presence ----
  async setPresence(userId: string, status: string, lastSeenMs: number): Promise<void> {
    this.presence.set(userId, { status, lastSeen: lastSeenMs });
  }
  async touchLastSeen(userId: string, lastSeenMs: number): Promise<void> {
    const entry = this.presence.get(userId);
    if (entry) {
      entry.lastSeen = lastSeenMs;
    } else {
      this.presence.set(userId, { status: 'ONLINE', lastSeen: lastSeenMs });
    }
  }
  async getPresence(userId: string): Promise<PresenceEntry | null> {
    return this.presence.get(userId) ?? null;
  }
  async getPresences(userIds: string[]): Promise<Record<string, PresenceEntry>> {
    const out: Record<string, PresenceEntry> = {};
    for (const id of userIds) {
      const entry = this.presence.get(id);
      if (entry) out[id] = entry;
    }
    return out;
  }
  async onlineCount(): Promise<number | null> {
    // Not authoritative in a single process's view on purpose: callers keep
    // the DB count they used before Phase 1 (parity with old behaviour).
    return null;
  }

  async close(): Promise<void> {
    this.queue.clear();
    this.claims.clear();
    this.matches.clear();
    this.matchedUsers.clear();
    this.pendingCalls.clear();
    this.callsByUser.clear();
    this.connections.clear();
    this.presence.clear();
  }
}
