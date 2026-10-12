/**
 * Minimal in-memory sliding-window rate limiter for hot abuse paths that the
 * HTTP plugin (@fastify/rate-limit) doesn't cover: socket events, OTP sends,
 * guest provisioning and report spam.
 *
 * NOTE for horizontal scale: this store is per-process. When the API runs on
 * multiple nodes (see AUDIT-AND-PLAN.md Phase 2) swap the Map for a Redis
 * INCR+EXPIRE implementation behind the same two functions.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Returns true when another hit within the window is allowed. */
export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Periodic sweep so the map can't grow unboundedly under key churn.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) {
      if (b && b.hits.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Drop expired entries for this key.
  while (bucket.hits.length && now - (bucket.hits[0] as number) > windowMs) {
    bucket.hits.shift();
  }

  if (bucket.hits.length >= limit) return false;
  bucket.hits.push(now);
  return true;
}

/** Test helper — clears all buckets. */
export function resetLimits(): void {
  buckets.clear();
  lastSweep = Date.now();
}
