import "server-only";
import { headers } from "next/headers";
import type { z } from "zod";
import type { DomainError } from "@/domain/shared/errors";
import type { Result } from "@/domain/shared/result";
import type { Actor } from "@/application/actor";
import { env } from "@/config/env";
import { container } from "../container";
import { currentActor } from "../auth/session";
import { errorToResponse, json, success } from "./errorToResponse";

export type RateLimitRule = { name: string; limit: number; windowSec: number };

export const RATE_LIMITS = {
  availability: { name: "availability", limit: 60, windowSec: 60 },
  createBooking: { name: "create-booking", limit: 5, windowSec: 60 },
  mutateBooking: { name: "mutate-booking", limit: 10, windowSec: 60 },
  login: { name: "login", limit: 10, windowSec: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function rateLimit(rule: RateLimitRule, actor: Actor): Promise<DomainError | null> {
  const subject = actor.kind === "user" ? `u:${actor.id}` : `ip:${await clientIp()}`;
  const r = await container().rateLimiter.consume(`${rule.name}:${subject}`, rule.limit, rule.windowSec);
  return r.allowed ? null : { kind: "RateLimited", retryAfterSec: r.retryAfterSec };
}

export function zodIssues(error: z.ZodError): DomainError {
  return {
    kind: "Validation",
    issues: error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
  };
}

/**
 * Wraps a route: resolves the actor, applies the rate limit, maps Result to
 * HTTP, and turns unexpected exceptions into an opaque 500 with a request id.
 */
export function route<C>(
  rule: RateLimitRule | null,
  fn: (ctx: { actor: Actor; req: Request; params: C }) => Promise<Result<unknown, DomainError> | Response>,
) {
  return async (req: Request, context: { params: Promise<C> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      if (req.method !== "GET" && !(await sameOrigin(req))) {
        return errorToResponse({ kind: "Forbidden", reason: "Cross-origin request refused" });
      }
      const actor = await currentActor();
      if (rule) {
        const limited = await rateLimit(rule, actor);
        if (limited) return errorToResponse(limited);
      }
      const out = await fn({ actor, req, params: await context.params });
      if (out instanceof Response) return out;
      return out.ok ? success(out.value) : errorToResponse(out.error);
    } catch (e) {
      container().logger.error("unhandled route error", {
        requestId,
        path: new URL(req.url).pathname,
        error: e instanceof Error ? e.message : String(e),
      });
      return json(
        500,
        { error: { kind: "Internal", requestId, message: `Something went wrong (ref ${requestId})` } },
        { "X-Request-Id": requestId },
      );
    }
  };
}

/** CSRF defence in depth on top of SameSite=Lax cookies. */
async function sameOrigin(req: Request): Promise<boolean> {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; cookies are still SameSite=Lax
  return origin === new URL(env().APP_URL).origin || origin === new URL(req.url).origin;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
