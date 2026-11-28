export interface Clock {
  now(): Date;
}

export interface RateLimiter {
  /** Consumes one token for `key`. */
  consume(key: string, limit: number, windowSec: number): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }>;
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}
