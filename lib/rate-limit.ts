/**
 * Simple in-memory rate limiter using sliding window.
 *
 * NOTE: This works fine for single-instance deploys (Cloudflare Pages Functions
 * each run in isolation so this is per-worker-instance). For stronger protection
 * in production, replace with Cloudflare Durable Objects or KV-backed limiter.
 *
 * For V1 login endpoint: 5 attempts per 15 min per IP is sufficient
 * since magic-link email already throttles naturally.
 */

interface Entry {
  count: number;
  resetAt: number;  // ms timestamp
}

const buckets = new Map<string, Entry>();

/**
 * Check if a key (e.g. IP address) is rate-limited.
 * @param key - identifier (IP, email, etc.)
 * @param limit - max attempts within window
 * @param windowMs - sliding window in milliseconds
 * @returns { allowed: boolean; retryAfterSec: number }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0, remaining: limit - existing.count };
}

/**
 * Reset the rate limit for a key (call after successful auth for instance).
 */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/**
 * Periodic cleanup — call from time to time to prevent map bloat.
 */
export function rateLimitCleanup(): void {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}
