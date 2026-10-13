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
  /**
   * Phase 3: premium users get a bounded head start in the priority order
   * (score = joinedAt - premium offset), matching the "premium priority
   * lanes" plan item without starving free users beyond the offset window.
   */
  premium?: boolean;
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
  //
  // Phase 3: the queue is ORDERED by priority score
  //   score = (joinedAt ?? now) - (premium ? PREMIUM_PRIORITY_MS : 0)
  // so listQueue() returns lowest score first — FIFO fairness for everyone,
  // with premium users jumping the line by at most PREMIUM_PRIORITY_MS.
  // Scanners walk the list in order, which prevents the old starvation
  // pattern where a waiting user could be passed over indefinitely.
  joinQueue(userId: string, entry: QueueEntry): Promise<void>;
  leaveQueue(userId: string): Promise<void>;
  getQueueEntry(userId: string): Promise<QueueEntry | null>;
  /** Priority order (best score first). */
  listQueue(): Promise<Array<[string, QueueEntry]>>;
  queueSize(): Promise<number>;

  /**
   * Phase 3 atomic dequeue: as ONE step, verify the user is unclaimed and
   * queued, REMOVE them from the ordered queue (hidden from other scanners)
   * and set their handshake claim. Returns the entry, or null when the user
   * is already claimed / not queued / gone. This replaces the old
   * list -> getQueueEntry -> claimUsers sequence whose non-atomic window let
   * disconnects and parallel scanners interleave.
   */
  claimCandidate(userId: string): Promise<QueueEntry | null>;
  /** Put a scanned-but-ineligible candidate back with their ORIGINAL score. */
  requeueCandidate(userId: string, entry: QueueEntry): Promise<void>;

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
  /**
   * O(1) user -> active match lookup. Used by the Phase-2 reconnect replay:
   * when a client that was mid-match reconnects (and may have missed
   * `match_found`), the server re-emits the live match instead of letting
   * them re-queue into a second one.
   */
  getMatchForUser(userId: string): Promise<MatchEntry | null>;
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
