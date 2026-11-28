import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/infra/ratelimit/memoryRateLimiter";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit per window, then returns Retry-After", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter(() => now);
    for (let i = 0; i < 3; i++) expect((await rl.consume("k", 3, 60)).allowed).toBe(true);
    now = 20_000;
    expect(await rl.consume("k", 3, 60)).toEqual({ allowed: false, retryAfterSec: 40 });
    expect((await rl.consume("other", 3, 60)).allowed).toBe(true);
    now = 60_001;
    expect((await rl.consume("k", 3, 60)).allowed).toBe(true);
  });
});
