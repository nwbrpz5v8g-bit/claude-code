import type { RateLimiter } from "@/application/ports/system";

/**
 * Sliding-window limiter held in process memory. Correct for a single
 * instance only; on serverless or multiple replicas, implement the same port
 * with Redis (e.g. @upstash/ratelimit).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, limit: number, windowSec: number) {
    const now = this.now();
    const windowStart = now - windowSec * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= limit) {
      const oldest = recent[0] ?? now;
      this.hits.set(key, recent);
      return { allowed: false as const, retryAfterSec: Math.max(1, Math.ceil((oldest + windowSec * 1000 - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.evict(windowStart);
    return { allowed: true as const };
  }

  private evict(windowStart: number) {
    for (const [k, ts] of this.hits) if (!ts.some((t) => t > windowStart)) this.hits.delete(k);
  }
}
