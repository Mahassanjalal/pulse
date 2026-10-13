import type { QueueEntry } from './types';

/**
 * Phase 3 queue priority scoring — the SINGLE source of truth shared by the
 * memory and Redis stores (byte-identical ordering across both):
 *
 *   score = (joinedAt ?? 0) - (premium ? PREMIUM_PRIORITY_MS : 0)
 *
 * Lower sorts first. Premium users get a bounded head start (default 30s);
 * a free user who has waited longer than that is still ahead of any premium
 * user who just joined — priority without starvation.
 */
export const PREMIUM_PRIORITY_MS = Number(process.env.MATCH_PREMIUM_PRIORITY_MS || 30_000);

export function queueScore(entry: QueueEntry): number {
  return (entry.joinedAt ?? 0) - (entry.premium ? PREMIUM_PRIORITY_MS : 0);
}
