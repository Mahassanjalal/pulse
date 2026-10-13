/**
 * Ephemeral realtime state consumed by the Socket.IO layer.
 *
 * Phase 1 replaces the raw in-process Maps with this interface and provides
 * two implementations:
 *   - MemoryRealtimeState: the previous single-node semantics (dev/test default)
 *   - RedisRealtimeState:  shared across API nodes so matchmaking, direct
 *     calls, multi-tab presence and kicks work when running >1 node
 *     (AUDIT-AND-PLAN Phase 1/2/3 groundwork).
 *
 * Everything here is LOST on restart by design — durable state lives in the
 * database.
 */

export interface QueueEntry {
  socketId: string;
  filters?: any;
  /** When the user entered the queue (enables wait-based filter widening). */
  joinedAt?: number;
  /** The gender roll computed at join time (used by the queue sweeper). */
  targetGender?: string | null;
}

export interface MatchEntry {
  user1: string;
  user2: string;
  matchId: string;
  startTime: number;
}

export interface PendingCall {
  callerId: string;
  calleeId: string;
}

export interface PresenceEntry {
  status: string;
  lastSeen: number;
}

export interface RealtimeStateStore {
  readonly kind: 'memory' | 'redis';

  // ---------- matchmaking queue ----------
  joinQueue(userId: string, entry: QueueEntry): Promise<void>;
  leaveQueue(userId: string): Promise<void>;
  getQueueEntry(userId: string): Promise<QueueEntry | null>;
  listQueue(): Promise<Array<[string, QueueEntry]>>;
  queueSize(): Promise<number>;

  /**
   * Atomically claim users for a match handshake (both-or-nothing).
   * Returns false when ANY user is already claimed — this is the primitive
   * that prevents two nodes/workers pairing the same waiting user twice.
   */
  claimUsers(...userIds: string[]): Promise<boolean>;
  releaseUsers(...userIds: string[]): Promise<void>;

  // ---------- active matches ----------
  addMatch(match: MatchEntry): Promise<void>;
  getMatch(matchId: string): Promise<MatchEntry | null>;
  /** Atomic take: returns the entry only if it existed (idempotent teardown). */
  deleteMatch(matchId: string): Promise<MatchEntry | null>;
  /** O(1) — was a full scan of every active match before. */
  isUserInMatch(userId: string): Promise<boolean>;
  listMatches(): Promise<Array<[string, MatchEntry]>>;

  // ---------- pending direct calls ----------
  /**
   * Atomically register a pending call; fails with busyRole when the caller
   * or callee already has a pending call (subsumes the old O(n) scans).
   */
  createPendingCall(
    callId: string,
    call: PendingCall,
    ttlSeconds: number,
  ): Promise<{ created: boolean; busyRole?: 'caller' | 'callee' }>;
  getPendingCall(callId: string): Promise<PendingCall | null>;
  /** Atomic take — used by accept/decline/cancel/timeout so only one wins. */
  deletePendingCall(callId: string): Promise<PendingCall | null>;
  /** All pending call ids involving a user (either role). */
  pendingCallIdsFor(userId: string): Promise<string[]>;

  // ---------- cross-node multi-tab socket registry ----------
  /** Returns first=true when this was the user's only/live connection. */
  addSocket(userId: string, socketId: string): Promise<{ first: boolean }>;
  /** Returns last=true when no sockets remain for the user anywhere. */
  removeSocket(userId: string, socketId: string): Promise<{ last: boolean }>;
  /** Refresh the connection-key lease (called from heartbeat). */
  touchConnections(userId: string): Promise<void>;
  /** True when the user has at least one live socket on ANY node. */
  hasSockets(userId: string): Promise<boolean>;

  // ---------- presence ----------
  setPresence(userId: string, status: string, lastSeenMs: number): Promise<void>;
  touchLastSeen(userId: string, lastSeenMs: number): Promise<void>;
  getPresence(userId: string): Promise<PresenceEntry | null>;
  getPresences(userIds: string[]): Promise<Record<string, PresenceEntry>>;
  /**
   * Number of users currently ONLINE. Returns null when this store cannot
   * answer authoritatively (memory store) so callers keep the DB count they
   * used before Phase 1.
   */
  onlineCount(): Promise<number | null>;

  // ---------- lifecycle ----------
  close(): Promise<void>;
}
