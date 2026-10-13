import type {
  MatchEntry,
  PendingCall,
  PresenceEntry,
  QueueEntry,
  RealtimeStateStore,
} from './types';
import { queueScore } from './score';

/**
 * In-memory realtime state — the exact semantics the backend had before
 * Phase 1 (single process). Used for local dev and tests (REDIS_URL unset),
 * so existing behaviour is unchanged when running one node.
 */
export class MemoryRealtimeState implements RealtimeStateStore {
  readonly kind = 'memory' as const;

  // Phase 3 models the Redis layout: DATA (hash) and RANKING (zset) are
  // separate — a claimed/in-flight candidate is removed from the ranking
  // (hidden from scanners) but their entry data survives for requeue.
  private queueData = new Map<string, QueueEntry>();
  private queueRanked = new Set<string>();
  private claims = new Set<string>();
  private matches = new Map<string, MatchEntry>();
  private userToMatch = new Map<string, string>();
  private pendingCalls = new Map<string, PendingCall>();
  private callsByUser = new Map<string, Set<string>>();
  private connections = new Map<string, Set<string>>();
  private presence = new Map<string, PresenceEntry>();

  // ---- queue ----
  async joinQueue(userId: string, entry: QueueEntry): Promise<void> {
    this.queueData.set(userId, entry);
    this.queueRanked.add(userId);
  }
  async leaveQueue(userId: string): Promise<void> {
    this.queueData.delete(userId);
    this.queueRanked.delete(userId);
  }
  async getQueueEntry(userId: string): Promise<QueueEntry | null> {
    return this.queueData.get(userId) ?? null;
  }
  async listQueue(): Promise<Array<[string, QueueEntry]>> {
    // Priority order: score asc, userId asc as a deterministic tiebreak so
    // both stores return byte-identical ordering for the conformance suite.
    const ranked: Array<[string, QueueEntry]> = [];
    for (const id of this.queueRanked) {
      const entry = this.queueData.get(id);
      if (entry) ranked.push([id, entry]);
    }
    return ranked.sort((a, b) => {
      const d = queueScore(a[1]) - queueScore(b[1]);
      return d !== 0 ? d : a[0].localeCompare(b[0]);
    });
  }
  async queueSize(): Promise<number> {
    return this.queueRanked.size;
  }

  async claimCandidate(userId: string): Promise<QueueEntry | null> {
    const entry = this.queueData.get(userId);
    if (!entry || !this.queueRanked.has(userId) || this.claims.has(userId)) return null;
    this.queueRanked.delete(userId); // hidden from scanners; data survives
    this.claims.add(userId);
    return entry;
  }
  async requeueCandidate(userId: string, entry: QueueEntry): Promise<void> {
    this.queueData.set(userId, entry);
    this.queueRanked.add(userId);
    this.claims.delete(userId);
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
    this.userToMatch.set(match.user1, match.matchId);
    this.userToMatch.set(match.user2, match.matchId);
  }
  async getMatch(matchId: string): Promise<MatchEntry | null> {
    return this.matches.get(matchId) ?? null;
  }
  async deleteMatch(matchId: string): Promise<MatchEntry | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    this.matches.delete(matchId);
    if (this.userToMatch.get(match.user1) === matchId) this.userToMatch.delete(match.user1);
    if (this.userToMatch.get(match.user2) === matchId) this.userToMatch.delete(match.user2);
    return match;
  }
  async isUserInMatch(userId: string): Promise<boolean> {
    return this.userToMatch.has(userId);
  }
  async getMatchForUser(userId: string): Promise<MatchEntry | null> {
    const matchId = this.userToMatch.get(userId);
    return matchId ? this.matches.get(matchId) ?? null : null;
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
    this.queueData.clear();
    this.queueRanked.clear();
    this.claims.clear();
    this.matches.clear();
    this.userToMatch.clear();
    this.pendingCalls.clear();
    this.callsByUser.clear();
    this.connections.clear();
    this.presence.clear();
  }
}
