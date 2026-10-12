/**
 * Registry for realtime (Socket.IO) capabilities that higher layers need but
 * must not import directly (would create a socket -> lib -> socket cycle).
 *
 * server.ts wires these after the Socket.IO server boots; lib/moderation.ts
 * uses them to kick a user's live sockets the moment their account is locked
 * (audit finding M11 — previously a locked user kept matching/calling until
 * their socket happened to reconnect).
 */

export interface RealtimeHooks {
  /** Force-disconnect every socket for a user and purge them from any
   *  matchmaking queue / pending call state. */
  kickUser: (userId: string, reason: string) => void;
}

let hooks: RealtimeHooks | null = null;

export function setRealtimeHooks(h: RealtimeHooks): void {
  hooks = h;
}

export function kickUser(userId: string, reason = 'ACCOUNT_LOCKED'): void {
  try {
    hooks?.kickUser(userId, reason);
  } catch (err) {
    console.error('kickUser hook failed:', err);
  }
}
